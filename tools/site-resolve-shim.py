"""Make the SITE NAME resolvable inside a frappe app container, so PDFs print.

WHY THIS EXISTS
    wkhtmltopdf runs inside the backend container and fetches the print page's
    assets over HTTP. Frappe hands it absolute URLs built by
    `frappe.utils.get_url()`, which with no `host_name` in site_config returns
    the SITE NAME and no port — `http://verify.bunood.test`. That name does not
    resolve inside the container at all, so every fetch dies at DNS and
    wkhtmltopdf exits with:

        Exit with code 1 due to network error: ConnectionRefusedError

    which frappe surfaces as a bare HTTP 500 on `download_pdf`. Measured on
    2026-08-30: all eight Bunood formats returned a 2 KB error page instead of
    a document, on a stack where the formats themselves render fine (printview
    was 200 for every one).

WHY NOT JUST SET `host_name`
    `bench set-config host_name http://frontend:8080` also fixes it, and was
    tried first. But `get_url()` builds USER-FACING links too — password
    resets, portal links, email footers — so that value would be wrong for a
    human clicking one. Making the name resolve keeps the site's own idea of
    its URL correct and confines the workaround to the container.

WHY NOT THE CHROME GENERATOR
    It produces a PDF where wkhtmltopdf 500s, but it DROPS the page footer and
    the letterhead name — re-measured here, confirming the note in
    printing/install.py: same invoice, wkhtmltopdf 856 chars including the
    address, phone and email; chrome 697 with all three absent. The format's
    `pdf_generator` pin stays on wkhtmltopdf.

WHAT IT DOES
    A dependency-free TCP forwarder (the image ships no socat, nc or iptables).
    Pair it with an /etc/hosts entry pointing the site name at 127.0.0.1:

        127.0.0.1 <site>

    then run this on port 80, forwarding to the frontend container, which
    serves the desk on 8080 internally (port 80 there answers nothing).

    Binding 80 needs root — `docker exec --user root` — even though the
    container's default user is `frappe`.

USAGE
    site-resolve-shim.py [upstream_host] [listen_port] [upstream_port]
    site-resolve-shim.py frontend 80 8080
"""

import socket
import sys
import threading

UPSTREAM = (
    sys.argv[1] if len(sys.argv) > 1 else "frontend",
    int(sys.argv[3]) if len(sys.argv) > 3 else 8080,
)
LISTEN_PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 80


def pipe(src, dst):
    try:
        while True:
            chunk = src.recv(65536)
            if not chunk:
                break
            dst.sendall(chunk)
    except OSError:
        pass
    finally:
        for sock in (src, dst):
            try:
                sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass


def serve(client):
    try:
        upstream = socket.create_connection(UPSTREAM, timeout=30)
    except OSError:
        client.close()
        return
    # BACK TO BLOCKING, BOTH ENDS. `create_connection(timeout=...)` leaves that
    # timeout ON the socket, so a later `recv` raises socket.timeout — an
    # OSError — and `pipe` tears the connection down mid-transfer. wkhtmltopdf
    # opens several asset fetches per render, so the first cut of this file
    # presented as three of eight PDFs failing at random, not as a clean break.
    upstream.settimeout(None)
    client.settimeout(None)
    threading.Thread(target=pipe, args=(client, upstream), daemon=True).start()
    threading.Thread(target=pipe, args=(upstream, client), daemon=True).start()


def main():
    # DUAL STACK. Binding 127.0.0.1 alone is not enough: curl picks IPv4 and
    # reports 200 while a Qt client resolves the name to ::1 first and finds
    # nothing, so the shim looks healthy and PDFs still fail.
    try:
        srv = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
        srv.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        bind_addr = ("::", LISTEN_PORT)
    except OSError:
        srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        bind_addr = ("0.0.0.0", LISTEN_PORT)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(bind_addr)
    srv.listen(128)
    sys.stderr.write(f"forwarding {bind_addr[0]}:{bind_addr[1]} -> {UPSTREAM[0]}:{UPSTREAM[1]}\n")
    sys.stderr.flush()
    while True:
        try:
            client, _ = srv.accept()
        except OSError:
            continue
        serve(client)


if __name__ == "__main__":
    main()

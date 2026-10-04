"""Native, unique PNG attachments for the isolated letterhead smoke check."""
import base64
import struct
import uuid
import zlib
from contextlib import contextmanager


def png_bytes(marker, pixel):
    def chunk(kind, data):
        return struct.pack('!I', len(data)) + kind + data + struct.pack('!I', zlib.crc32(kind + data) & 0xffffffff)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('!2I5B', 1, 1, 8, 6, 0, 0, 0)) + chunk(b'tEXt', b'fixture\x00' + marker.encode('ascii')) + chunk(b'IDAT', zlib.compress(b'\x00' + bytes(pixel))) + chunk(b'IEND', b'')


@contextmanager
def owned_print_logos(expected_site):
    import frappe
    if expected_site not in {'demo.bunood.test', 'team-rc.localhost', 'official-native-acceptance.localhost'} or frappe.local.site != expected_site or not frappe.conf.get('allow_tests') or frappe.session.user != 'Administrator':
        raise RuntimeError('Print logo fixtures require exact disposable allow_tests site and Administrator')
    owned = []
    original = None
    try:
        token = uuid.uuid4().hex
        result = {}
        for key, pixel in [('theme', (220, 30, 20, 255)), ('company', (20, 50, 220, 255))]:
            name = 'bnd-aa-' + token + '&' + key + '.png'
            content = png_bytes(token + key, pixel)
            if frappe.db.exists('File', {'file_name': name}):
                raise RuntimeError('Print logo fixture collision')
            # Pass binary content into native File insert; the legacy save_file
            # utility rereads a path with text fallback encodings before reinserting.
            doc = frappe.get_doc({"doctype": "File", "file_name": name, "content": content, "is_private": 0}).insert()
            owned.append((doc.name, doc.file_url, doc.file_name, content))
            if doc.owner != 'Administrator' or doc.is_private or not doc.file_name.startswith('bnd-aa-' + token):
                raise RuntimeError('Unexpected native logo attachment identity')
            result[key + '_url'] = doc.file_url
            result[key + '_src'] = 'data:image/png;base64,' + base64.b64encode(content).decode('ascii')
        yield result
    except BaseException as error:
        original = error
        raise
    finally:
        try:
            # All ownership checks precede the first physical File deletion.
            docs = []
            for name, url, filename, content in owned:
                doc = frappe.get_doc('File', name)
                if doc.owner != 'Administrator' or doc.file_url != url or doc.file_name != filename or doc.is_private or doc.attached_to_doctype or doc.attached_to_name or doc.get_content(encodings=[]) != content:
                    raise RuntimeError('Owned logo changed; refusing cleanup')
                docs.append(doc)
            for doc in docs:
                frappe.delete_doc('File', doc.name)
            # This helper owns the bench process transaction. Explicit rollback
            # restores all probe data and runs native new-File rollback callbacks;
            # merely closing the DB connection does not clean physical uploads.
            frappe.db.rollback()
        except BaseException as cleanup:
            raise RuntimeError('OWNED_LOGO_CLEANUP_FAILED') from (original or cleanup)

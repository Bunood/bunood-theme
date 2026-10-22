# Zero One HR — الموارد البشرية في زيرو ون

Zero One's HR app: the HR desk at `/people`, built with Vue and frappe-ui like the
engineering office (`/engineering`) and the CRM (`/crm`), over Frappe HR's own data
model. It forks none of HRMS's doctypes. It adds what a Saudi HR desk needs and HRMS
does not carry: HRMS's regional code covers India and the UAE only, so GOSI, the wage
protection file (Mudad), end of service under the Labor Law and the 30-day month are
this app's.

The screens follow the v0.1 design canvas: *زيرو ون — الموارد البشرية v0.1*.

## What is built (slice 1)

| Area | Where | State |
| --- | --- | --- |
| Saudi rules: GOSI, 30-day wages, overtime (Art. 107), Art. 92 instalment cap, end of service (Arts. 84, 85, 80, 87), leave encashment (Art. 111) | `zerone_hr/saudi/` | Pure Python, tested against the design's figures |
| Where each employee stands today | `zerone_hr/logic/day.py` | Pure Python, tested |
| APIs: today, attendance, employees | `zerone_hr/api/` | Integration-tested on a Frappe 16 bench |
| Employee additions: nationality, dated documents (iqama, work permit, SCE membership …) | `install.py`, `Zero One Employee Document` | Custom fields, created on install and migrate |
| Screens: Today, Employees, Attendance, the shell and navigation | `frontend/` | Built; Arabic and English, light and dark |
| Design gates and Arabic coverage | `tools/gates.py`, `tools/i18n.py` | In the test suite and the build |

Next, from the canvas: the employee profile, leave and requests, the monthly
attendance sheet, the payroll run and payment (Mudad file, journal entry, payslip),
salary components and GOSI rates in settings, end of service and compliance, and the
employee's phone app.

## How it wears the theme

The page (`zerone_hr/www/people.py`) links bunood-theme's web sheet and the site's brand
sheet and stamps `data-hr-theme="bunood"` on `<html>`. `frontend/src/theme.css` points
frappe-ui's semantic variables at the theme's tokens under that attribute, so the app
takes the tenant's colours, Arabic face and riyal sign in both modes without a copy
of its own. A site without the theme renders on frappe-ui's defaults.

In components, write frappe-ui's semantic classes (`bg-surface-gray-1`,
`text-ink-gray-7`), logical properties (`ms-2`, `text-start`), and statuses only on the
bridge's steps (`bg-surface-amber-2 text-ink-amber-7`). `tools/gates.py` refuses
physical properties, colour literals, raw palette steps, our own fonts and the theme's
own names; it runs before every build.

## Strings

Sources are English, every one with the context `Zero One HR`
(`__('Employees')`, `_("…", context="Zero One HR")`); `zerone_hr/locale/ar.po` is the
Arabic and the place to edit it. Counted strings use `count(n, '{0} employees')` and
carry one translation per Arabic plural form (zero, one, two, few, many, other).
`tools/i18n.py` lists what is missing; the suite fails on any gap.

## Develop

```bash
# Rules, logic, gates, Arabic coverage (no bench needed)
python -m pytest -q

# Front end: build into zerone_hr/public/frontend and zerone_hr/www/people.html
cd frontend && yarn install && yarn build      # `yarn dev` proxies to a local bench

# On a bench (Frappe 16, ERPNext, HRMS)
bench get-app <this repo> && bench --site <site> install-app zerone_hr
bench --site <site> run-tests --app zerone_hr
```

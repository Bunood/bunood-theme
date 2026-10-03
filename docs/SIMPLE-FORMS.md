# Simple and Advanced business forms

## Goal

Bunood business forms default to the smallest useful version of the native Frappe
form. **Simple** shows the fields needed to complete the current task. **Advanced**
restores every ERPNext field on the same document. This is progressive disclosure,
not a second form system.

The Simple header keeps New, Save, Delete, Print and Submit visible when each action
is valid. F1, F2, F4, F6 and F8 invoke those same native actions. Buttons disappear
when the document state, permissions or DocType contract make them invalid. The
Simple/Advanced switch remains visible in both modes instead of moving into a menu.

## Explicit task profiles

Profiles keep the workflow fields for these common forms:

| Area | Forms |
| --- | --- |
| Selling | Quotation, Sales Order, Delivery Note |
| Buying | Purchase Order, Purchase Receipt, Material Request |
| Inventory | Stock Entry, Stock Reconciliation, Pick List, Packing Slip |
| Accounting | Payment Entry, Journal Entry |
| Masters | Customer, Supplier, Item, Warehouse |
| Manufacturing | BOM, Work Order, Job Card |
| Assets and work | Asset, Project, Task, Timesheet, Expense Claim |

Sales Invoice and Purchase Invoice use the specialized bill workbench documented in
`QUICK-BILL.md`.

Explicit profiles are deliberately closed lists. Bold or list-view fields added by
an installed app do not automatically leak into Simple mode; this prevents specialist
configuration and long compliance instructions from taking over routine tasks. An
empty field that is truly mandatory is still added so native validation cannot become
a dead end. Payment Entry therefore presents the direction, party, accounts, amount,
allocation and reference workflow without showing the optional ZATCA prepayment
configuration unless the user opens Advanced.

## Safe coverage for other business DocTypes

Business DocTypes without an explicit profile receive a metadata-based Simple view.
It retains the title field, required, bold and list-view fields, plus recognized task
tables such as items, accounts, references, operations, expenses and time logs. This
also covers custom vertical DocTypes without hard-coding their names.

Child tables, Single settings and Frappe framework modules such as Core, Desk, Email,
Website, Printing, Workflow and Automation stay Advanced. Their purpose is system
administration or composition rather than a repeatable business transaction, and
hiding their fields would make them harder to reason about.

## Technical boundary

The controller only marks existing native field wrappers as selected or omitted.
It does not create substitute controls or intercept document calculations. Advanced
removes the Bunood presentation class and reveals the native form immediately. Field
permissions, dependencies, mandatory checks, workflows, client scripts and server
validation therefore remain in force in both modes.

When a new core workflow is added, give it an explicit profile after testing the
happy path, required exceptions, permissions and mobile/RTL presentation. The
metadata fallback is a safe starting point, not a claim that every vertical workflow
has already received product-specific copy or task design.

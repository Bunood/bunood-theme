# Copyright (c) 2026, Bunood and contributors
# For license information, please see license.txt
"""Theme Settings controller.

WHAT
    The single per-site configuration document for the theme.

WHY THE CONTROLLER IS THIN
    Regenerating the brand stylesheet is wired through the ``doc_events`` hook in
    ``hooks.py`` rather than an ``on_update`` method here. That keeps the side effect
    discoverable from the manifest — someone reading ``hooks.py`` can see everything
    the app reacts to — and keeps this class free to hold validation only.
"""

import frappe
from frappe import _
from frappe.model.document import Document

from bunood_theme import palette

#: The four seed fields. Named once because both the normaliser and the contrast
#: report iterate them, and a fifth colour added to one list but not the other
#: would go unnormalised or unreported without anything saying so.
COLOUR_FIELDS = ("brand_color", "accent_color", "brand_color_dark", "accent_color_dark")


class ThemeSettings(Document):
	"""Per-site theme configuration.

	Validation lives here; asset generation lives in :mod:`bunood_theme.brand`.
	"""

	def validate(self):
		"""Normalise colour values before they reach the stylesheet generator.

		Frappe's Color control can yield values with inconsistent case or stray
		whitespace depending on whether the user typed or picked. The generator
		interpolates these straight into CSS, so they are normalised once here rather
		than defensively at every use site.
		"""
		for field in COLOUR_FIELDS:
			value = self.get(field)
			if value:
				self.set(field, value.strip().lower())

		self.report_contrast_adjustments()

	def report_contrast_adjustments(self):
		"""Tell the administrator what the theme did with their colours.

		THIS DOES NOT REJECT ANYTHING, AND THAT IS THE DESIGN (checklist item 32).
		A tenant's brand colour is their identity, not a preference. Refusing it
		produces a support ticket, not an accessible desk — so :mod:`palette`
		derives a legible fill and ink for whatever is entered, and the only thing
		left to do here is say so. A bright yellow keeps its yellow and gets dark
		labels; a colour in the narrow band where neither white nor dark ink can
		reach 4.5:1 gets a fill shifted by a few percent.

		Silence would be the other failure mode: an administrator who pastes a hex
		and later finds a different one in the CSS has been surprised by their own
		tool.

		THREE THINGS KEEP THIS FROM BECOMING NOISE, and the first two were learned
		by breaking the suite:

		* It fires only when a COLOUR FIELD CHANGED in this save. The shipped
		  default is itself adjusted, so reporting on every save would nag every
		  administrator about a colour they never chose, on every unrelated edit.
		* It is an alert toast, not a modal. As a modal it sat over the form and
		  intercepted the next click — two smoke tests failed on exactly that,
		  which is a fair proxy for what it would have done to a real user.
		* It says nothing when nothing moved.

		Never fails the save. A colour that cannot be modelled is a reason to fall
		back to the shipped palette — which ``brand.py`` already does — not a reason
		to lock an administrator out of their own settings form.
		"""
		before = self.get_doc_before_save()
		if not before:
			# First write of the Single. Nobody CHANGED anything, so there is
			# nothing to report; the shipped seed's own adjustment is a property
			# of the theme, documented in CHANGELOG, not news about this save.
			return
		if not any(before.get(f) != self.get(f) for f in COLOUR_FIELDS):
			return

		try:
			notes = palette.adjustments(
				(self.get("brand_color") or "#4d8756"),
				(self.get("accent_color") or "#4463f0"),
			)
		except Exception:
			frappe.log_error("bunood_theme: contrast adjustment report failed")
			return

		if not notes:
			return

		rendered = [_note_sentence(n) for n in notes]
		rendered = [s for s in rendered if s]
		if not rendered:
			return

		# ONE TRANSLATABLE SENTENCE, NOT A GLUED PREFIX. This used to be
		# `_("Adjusted for readability") + ": " + " ".join(notes)`, where the
		# notes were raw English f-strings from palette.py. The prefix was
		# translated and the body never could be — f-strings are invisible to
		# every message extractor — so the message was permanently half English
		# while looking covered to anything that only checked the prefix.
		frappe.msgprint(
			_("Adjusted for readability: {details}").format(details=" ".join(rendered)),
			indicator="blue",
			alert=True,
		)


def _note_sentence(note: dict) -> str:
	"""One contrast-adjustment fact, as a whole translated sentence.

	SIX TEMPLATES, NOT THREE WITH A SPLICED FRAGMENT. The light and dark
	variants are written out in full rather than assembled from a shared stem
	plus `" in dark mode"`. A fragment glued into the middle of a clause cannot
	survive translation into a language that orders the clause differently, and
	Arabic is one — so the mode has to be part of the sentence a translator is
	given, not something done to it afterwards.

	NAMED PLACEHOLDERS, NOT `{0}`. These interpolate colour VALUES. The build's
	plural guard (`tools/i18n.mjs`) refuses a numeric placeholder that governs a
	following word, because that shape has no correct Arabic through a
	plural-free dictionary; a named placeholder says "this is a value, not a
	count" and is ignored by it. Use `{0}` for counts you have already reshaped,
	and a name for everything else.
	"""
	kind, mode = note.get("kind"), note.get("mode")
	dark = mode == "dark"

	if kind == "brand_fill":
		template = (
			_("Brand fills in dark mode use {used} rather than {chosen}, so their labels stay readable and the fill stays visible against the chrome.")
			if dark
			else _("Brand fills use {used} rather than {chosen}, so their labels stay readable and the fill stays visible against the chrome.")
		)
		return template.format(used=note.get("used", ""), chosen=note.get("chosen", ""))

	if kind == "brand_ink":
		return (
			_("Labels on brand fills in dark mode are dark rather than white.")
			if dark
			else _("Labels on brand fills are dark rather than white.")
		)

	if kind == "focus_ring":
		template = (
			_("The focus ring in dark mode uses {used} rather than {chosen}, to stay visible on every surface.")
			if dark
			else _("The focus ring uses {used} rather than {chosen}, to stay visible on every surface.")
		)
		return template.format(used=note.get("used", ""), chosen=note.get("chosen", ""))

	# An unknown kind is a palette.py change that forgot this function. Saying
	# nothing is right: the adjustment still happened and is still correct, and
	# a half-rendered sentence would be worse than a shorter report.
	return ""

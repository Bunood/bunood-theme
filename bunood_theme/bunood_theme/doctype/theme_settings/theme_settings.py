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

from frappe.model.document import Document


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
		for field in ("brand_color", "accent_color", "brand_color_dark", "accent_color_dark"):
			value = self.get(field)
			if value:
				self.set(field, value.strip().lower())

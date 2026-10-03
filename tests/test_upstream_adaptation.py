"""Pure regression checks for adapted upstream fixes; no site or database writes."""
import importlib.util
import ast
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from bunood_theme import palette, presets
from bunood_theme.contrast import parse_color, ratio
from jinja2 import Environment, FileSystemLoader, StrictUndefined


class Site(dict):
    def as_dict(self):
        return dict(self)


def module_at(name, path, frappe):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    with patch.dict(sys.modules, {'frappe': frappe}):
        spec.loader.exec_module(module)
    return module


class AdaptationTests(unittest.TestCase):
    def resolve(self, preferences, **site_values):
        stub = SimpleNamespace(
            whitelist=lambda: lambda fn: fn, read_only=lambda: lambda fn: fn,
            defaults=SimpleNamespace(get_user_default=lambda key: preferences.get(key)),
        )
        boot = module_at('adaptation_boot', 'bunood_theme/boot.py', stub)
        site = Site(presets._shipped_baseline())
        site.update(site_values)
        before = dict(site)
        resolved, personal = boot.resolve_for_user(site)
        self.assertEqual(site, before, 'shared site doc remains untouched')
        return site, resolved, personal

    def test_hidden_pane_comfort_does_not_change_the_layout_identity(self):
        site, resolved, personal = self.resolve({'bnd_pane_state': 'Hidden'}, personal_comfort=1)
        self.assertEqual(resolved['sidebar_pane_state'], 'Hidden')
        self.assertEqual(personal['shape_name'], presets.layout_of(site))
        self.assertEqual(personal['overrides']['sidebar_pane_state'], 'Hidden')

    def test_locked_intents_remain_stored_but_have_no_effective_override(self):
        site, resolved, personal = self.resolve({'bnd_pane_state': 'Hidden', 'bnd_body_width': 'Wide'}, personal_comfort=0)
        self.assertEqual(resolved['sidebar_pane_state'], site['sidebar_pane_state'])
        self.assertEqual(resolved['desk_width'], site['desk_width'])
        self.assertEqual(personal['pane_state'], 'Hidden')
        self.assertEqual(personal['overrides'], {})

    def test_legacy_rail_intent_is_still_open(self):
        _, resolved, personal = self.resolve({'bnd_pane_state': 'Rail'}, personal_comfort=1)
        self.assertEqual(resolved['sidebar_pane_state'], 'Open')
        self.assertEqual(personal['pane_state'], 'Open')

    def test_good_signal_is_fitted_as_text_on_every_surface(self):
        for seed in ('#3d8150', '#F5C542', '#FFFFFF', '#000000'):
            for mode in ('light', 'dark'):
                tokens = palette.derive(seed, '#0090ff', mode)
                for surface in ('--bnd-surface', '--bnd-page', '--bnd-raised', '--bnd-pane', '--bnd-hover', '--bnd-active'):
                    self.assertGreaterEqual(ratio(parse_color(tokens['--bnd-good']), parse_color(tokens[surface])), 4.5, (seed, mode, surface))

    def test_print_setting_uses_the_local_catalogue_preserves_zero_and_handles_missing_meta(self):
        get_cached_doc = Mock(return_value=Site(print_title_lang='', print_qr='Hide', print_custom=0))
        stub = SimpleNamespace(get_cached_doc=get_cached_doc)
        helper = module_at('adaptation_print', 'bunood_theme/printing/jinja.py', stub).bunood_print_setting
        self.assertEqual(helper('print_title_lang'), 'Follow print language')
        self.assertEqual(helper('print_qr'), 'Hide')
        get_cached_doc.return_value['print_qr'] = 0
        self.assertEqual(helper('print_qr'), 0)
        get_cached_doc.side_effect = RuntimeError('pre-migrate')
        self.assertEqual(helper('print_qr'), presets.PRINT_DEFAULTS['print_qr'])
        self.assertEqual(helper('not_a_print_field'), '')

    def test_live_clear_returns_a_refreshed_personal_override_map(self):
        preferences = {'bnd_body_width': 'Wide'}
        site = Site(presets._shipped_baseline(), personal_comfort=1)
        defaults = SimpleNamespace(
            get_user_default=lambda key: preferences.get(key),
            clear_default=lambda key, parent: preferences.pop(key, None),
            set_default=lambda key, value, parent: preferences.update({key: value}),
        )
        stub = SimpleNamespace(
            whitelist=lambda: lambda fn: fn, read_only=lambda: lambda fn: fn,
            defaults=defaults, session=SimpleNamespace(user='Fixture'),
            get_cached_doc=Mock(return_value=site), cache=SimpleNamespace(hdel=Mock()),
        )
        boot = module_at('adaptation_clear_boot', 'bunood_theme/boot.py', stub)
        source = ast.parse((ROOT / 'bunood_theme/api.py').read_text(encoding='utf-8'))
        function = next(node for node in source.body if isinstance(node, ast.FunctionDef) and node.name == 'set_personal')
        function.decorator_list = []
        scope = {'frappe': stub, '_personal_open': lambda _: True}
        exec(compile(ast.Module(body=[function], type_ignores=[]), '<set_personal>', 'exec'), scope)
        with patch.dict(sys.modules, {'bunood_theme.boot': boot}):
            result = scope['set_personal']({'bnd_body_width': ''})
        self.assertEqual(result['written'], ['bnd_body_width'])
        self.assertEqual(result['personal']['body_width'], '')
        self.assertNotIn('desk_width', result['personal']['overrides'])

    def test_shared_macros_preserve_local_title_language_and_required_qr(self):
        language = ['ar']
        env = Environment(loader=FileSystemLoader(ROOT / 'bunood_theme'), undefined=StrictUndefined)
        env.globals.update(
            bunood_print_setting=lambda field: presets.PRINT_DEFAULTS[field],
            bunood_print_language=lambda: language[0],
            bunood_zatca_qr_src=lambda doc: '/files/fixture-qr.png',
        )
        template = env.get_template('templates/bunood_print_macros.html')
        self.assertIn('العنوان', template.module.doc_title('العنوان', 'English title'))
        self.assertNotIn('English title', template.module.doc_title('العنوان', 'English title'))
        language[0] = 'en'
        self.assertIn('English title', template.module.doc_title('العنوان', 'English title'))
        self.assertNotIn('العنوان', template.module.doc_title('العنوان', 'English title'))
        env.globals['bunood_print_setting'] = lambda field: 'Hide' if field == 'print_qr' else presets.PRINT_DEFAULTS[field]
        self.assertIn('/files/fixture-qr.png', template.make_module().zatca_qr(Site(), required=True))


if __name__ == '__main__':
    unittest.main()

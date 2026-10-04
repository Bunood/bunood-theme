import importlib.util
from pathlib import Path
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import Mock, patch
spec=importlib.util.spec_from_file_location('logo_fixture',Path(__file__).parents[1]/'tools'/'print_logo_fixture.py')
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
class LogoSafety(TestCase):
 def setUp(self):
  self.docs={}
  def save(name,content,*args,**kw):
   doc=SimpleNamespace(name=str(len(self.docs)),file_name=name,file_url='/files/'+name,owner='Administrator',is_private=0,attached_to_doctype=None,attached_to_name=None,get_content=lambda:content)
   self.docs[doc.name]=doc;return doc
  self.api=SimpleNamespace(local=SimpleNamespace(site='demo.bunood.test'),conf={'allow_tests':1},session=SimpleNamespace(user='Administrator'),db=SimpleNamespace(exists=Mock(return_value=False)),get_doc=lambda dt,name:self.docs[name],delete_doc=Mock())
  self.mods={'frappe':self.api,'frappe.utils':SimpleNamespace(),'frappe.utils.file_manager':SimpleNamespace(save_file=save)}
 def test_real_png_distinct_payload_and_owned_cleanup(self):
  with patch.dict('sys.modules',self.mods):
   with f.owned_print_logos('demo.bunood.test') as logos:
    self.assertNotEqual(logos['theme_src'],logos['company_src'])
    for doc in self.docs.values():
     content=doc.get_content();self.assertTrue(content.startswith(b'\x89PNG\r\n\x1a\n'));at=8
     while at<len(content):
      length=f.struct.unpack('!I',content[at:at+4])[0];kind=content[at+4:at+8];data=content[at+8:at+8+length];crc=f.struct.unpack('!I',content[at+8+length:at+12+length])[0]
      self.assertEqual(crc,f.zlib.crc32(kind+data)&0xffffffff)
      if kind==b'IDAT': self.assertEqual(len(f.zlib.decompress(data)),5)
      at+=length+12
   self.assertEqual(self.api.delete_doc.call_count,2)
 def test_wrong_site_refused(self):
  with patch.dict('sys.modules',self.mods),self.assertRaises(RuntimeError):
   with f.owned_print_logos('production'): pass
  self.assertFalse(self.docs)
 def test_tests_disabled_refused(self):
  self.api.conf['allow_tests']=0
  with patch.dict('sys.modules',self.mods),self.assertRaises(RuntimeError):
   with f.owned_print_logos('demo.bunood.test'): pass
  self.assertFalse(self.docs)
 def test_all_ownership_checked_before_first_delete(self):
  with patch.dict('sys.modules',self.mods),self.assertRaisesRegex(RuntimeError,'OWNED_LOGO_CLEANUP_FAILED'):
   with f.owned_print_logos('demo.bunood.test'): self.docs['1'].owner='Someone'
  self.api.delete_doc.assert_not_called()
 def test_changed_content_refuses_cleanup(self):
  with patch.dict('sys.modules',self.mods),self.assertRaisesRegex(RuntimeError,'OWNED_LOGO_CLEANUP_FAILED'):
   with f.owned_print_logos('demo.bunood.test'): self.docs['1'].get_content=lambda:b'changed'
  self.api.delete_doc.assert_not_called()
 def test_callback_error_preserved_when_cleanup_succeeds(self):
  original=ValueError('original')
  with patch.dict('sys.modules',self.mods):
   try:
    with f.owned_print_logos('demo.bunood.test'): raise original
   except ValueError as error:self.assertIs(error,original)
  self.assertEqual(self.api.delete_doc.call_count,2)
 def test_cleanup_failure_keeps_original_cause(self):
  original=ValueError('original');self.api.delete_doc.side_effect=RuntimeError('cleanup')
  with patch.dict('sys.modules',self.mods):
   try:
    with f.owned_print_logos('demo.bunood.test'): raise original
   except RuntimeError as error:self.assertEqual(str(error),'OWNED_LOGO_CLEANUP_FAILED');self.assertIs(error.__cause__,original)
if __name__=='__main__':main()

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertAttachmentPair} from '../tools/axe-native-item-attachments.mjs';
const fixture=()=>({record:'BND-TEST-001',data:{image:'/files/a.png',files:[{name:'file1',url:'/files/a.png'}]},inventory:['image-alt:/files/a.png','link-name:file1','nested-interactive:file1'].map(identity=>({identity,valid:true})),failures:['image-alt:/files/a.png','link-name:file1','nested-interactive:file1'].map(identity=>({identity,valid:true})),allFailures:['image-alt:.sidebar-image','link-name:.attachment-icon','nested-interactive:.data-pill'],themePresent:false,blockedAssets:6});
test('exact same native attachment/image data and failures qualify',()=>assert.doesNotThrow(()=>assertAttachmentPair(fixture(),fixture())));
for(const [name,mutate] of [
 ['Theme runtime',s=>s.themePresent=true],['no blocked assets',s=>s.blockedAssets=0],
 ['wrong record',s=>s.record='other'],['missing metadata',s=>s.data={}],
 ['different File',s=>s.data.files[0].name='other'],['different image',s=>s.data.image='/files/b.png'],
 ['duplicate inventory',s=>s.inventory.push(s.inventory[0])],['missing inventory',s=>s.inventory.pop()],
 ['unknown ownership',s=>s.inventory[0].valid=false],['Theme-owned failure',s=>s.failures[0].valid=false],
 ['unknown failure identity',s=>s.failures[0].identity='image-alt:other'],['removed failure',s=>s.failures.pop()],
 ['new nonattachment failure',s=>s.allFailures.push('image-alt:.new-theme-image')],
 ['duplicate failure',s=>s.failures.push(s.failures[0])],
 ['empty failure inventory',s=>s.failures=[]],
])test('rejects '+name,()=>{const stock=fixture();mutate(stock);assert.throws(()=>assertAttachmentPair(fixture(),stock));});

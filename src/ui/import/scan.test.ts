import { describe, it, expect, vi, afterEach } from 'vitest';
const h = vi.hoisted(() => ({close: null as null | (()=>void), status:{textContent:''}, video:{srcObject:null,play:vi.fn().mockResolvedValue(undefined),videoWidth:0}, read:vi.fn().mockResolvedValue([])}));
vi.mock('../sheet',()=>({openSheet:vi.fn(),closeSheet:()=>h.close?.(),sheetTop:()=>'',sheetBody:{querySelector:(s:string)=>s==='#scan-video'?h.video:h.status}}));
vi.mock('zxing-wasm/reader',()=>({prepareZXingModule:vi.fn(),readBarcodes:h.read}));
import { scanCamera } from './scan';
const flush=async()=>{ for(let i=0;i<20;i++) await Promise.resolve(); };
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();h.video.play.mockResolvedValue(undefined);h.video.videoWidth=0;h.read.mockResolvedValue([]);});
function setup(getUserMedia:any) {
 vi.useFakeTimers();
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});
 vi.stubGlobal('window',globalThis);
 vi.stubGlobal('document',{getElementById:()=>({addEventListener:(_e:string,fn:()=>void)=>h.close=fn}),createElement:()=>({getContext:()=>({drawImage:()=>{},getImageData:()=>({})})})});
}
const options={title:'Synthetic licence',hint:'Use a synthetic barcode',formats:['PDF417'] as any,accept:(s:string)=>s==='accepted'};
describe('camera stream lifecycle',()=>{
 for(const exit of ['Cancel','Escape'])it(`stops tracks on ${exit}`,async()=>{
  const stop=vi.fn();setup(vi.fn().mockResolvedValue({getTracks:()=>[{stop}]}));
  const p=scanCamera(options);await flush();h.close?.();expect(await p).toBeNull();expect(stop).toHaveBeenCalled();
 });
 it('stops a permission response arriving after cancellation',async()=>{
  let grant:any;const stop=vi.fn();setup(()=>new Promise(r=>grant=r));
  const p=scanCamera(options);h.close?.();grant({getTracks:()=>[{stop}]});await flush();expect(await p).toBeNull();expect(stop).toHaveBeenCalled();
 });
 it('stops on success',async()=>{
  const stop=vi.fn();setup(vi.fn().mockResolvedValue({getTracks:()=>[{stop}]}));h.video.videoWidth=1920;h.read.mockResolvedValue([{isValid:true,text:'accepted'}]);
  const p=scanCamera(options);await flush();await vi.dynamicImportSettled();await vi.advanceTimersByTimeAsync(600);expect(await p).toBe('accepted');expect(stop).toHaveBeenCalled();
 });
 it('stops when video fails and gives a photo fallback',async()=>{
  const stop=vi.fn();setup(vi.fn().mockResolvedValue({getTracks:()=>[{stop}]}));h.video.play.mockRejectedValueOnce(Error('video failed'));
  const p=scanCamera(options);await flush();expect(stop).toHaveBeenCalled();expect(h.status.textContent).toMatch(/photo/);h.close?.();await p;
 });
 it('camera refusal gives a fallback',async()=>{
  setup(vi.fn().mockRejectedValue(Error('denied')));const p=scanCamera(options);await flush();expect(h.status.textContent).toMatch(/permission.*photo/);h.close?.();await p;
 });
});


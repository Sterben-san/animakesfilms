// Native dialogs keep focus contained and support Escape automatically.
export function dialog(title, html, attach) {
  return new Promise(resolve => {
    const d = document.createElement('dialog'); d.className = 'studio-dialog';
    d.innerHTML = `<div class="dialog-heading"><h2></h2><button type="button" data-close aria-label="Close dialog">✕</button></div>${html}`;
    d.querySelector('h2').textContent = title; document.body.append(d);
    let result = null;
    const finish = value => { result = value; d.close(); };
    d.addEventListener('close', () => { d.remove(); resolve(result); }, { once: true });
    d.querySelector('[data-close]').onclick = () => finish(null);
    attach?.(d, finish); d.showModal();
  });
}
export function confirmAction(title, message) {
  return dialog(title, '<p data-message></p><button type="button" class="primary" data-confirm>Confirm</button>', (d, done) => {
    d.querySelector('[data-message]').textContent = message;
    d.querySelector('[data-confirm]').onclick = () => done(true);
  });
}
export async function cropImage(file) {
  if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const url = URL.createObjectURL(file), img = new Image();
  try {
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = () => reject(new Error('This image could not be opened.')); img.src = url; });
    return await dialog('Prepare your image', `<p>Keep the original or crop a frame. Drag the image to reposition it.</p><canvas width="700" height="440" aria-label="Crop preview"></canvas><div class="crop-controls"><label>Frame shape<select data-shape><option value="original">Original proportions</option><option value="1">Square</option><option value="1.7777778">Landscape 16:9</option><option value="0.8">Portrait 4:5</option></select></label><label>Zoom<input data-zoom type="range" min="1" max="3" step="0.01" value="1"></label><label>Rotation<select data-rotate><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label></div><div class="dialog-actions"><button type="button" class="secondary" data-original>Use original</button><button type="button" class="primary" data-crop>Crop and upload</button></div>`, (d, done) => {
      const canvas = d.querySelector('canvas'), ctx = canvas.getContext('2d'); let x = 0, y = 0, drag;
      const rotatedSize = () => Number(d.querySelector('[data-rotate]').value) % 180 ? [img.height,img.width] : [img.width,img.height];
      const draw = () => {
        const [w,h] = rotatedSize(), ratio = d.querySelector('[data-shape]').value;
        canvas.height = Math.round(canvas.width / (ratio === 'original' ? w/h : Number(ratio)));
        const scale = Math.max(canvas.width/w,canvas.height/h) * Number(d.querySelector('[data-zoom]').value);
        x = Math.max(-(w*scale-canvas.width)/2, Math.min((w*scale-canvas.width)/2,x));
        y = Math.max(-(h*scale-canvas.height)/2, Math.min((h*scale-canvas.height)/2,y));
        ctx.clearRect(0,0,canvas.width,canvas.height); ctx.save(); ctx.translate(canvas.width/2+x,canvas.height/2+y); ctx.rotate(Number(d.querySelector('[data-rotate]').value)*Math.PI/180); ctx.scale(scale,scale); ctx.drawImage(img,-img.width/2,-img.height/2); ctx.restore();
      };
      d.querySelectorAll('select,input').forEach(el => el.oninput = () => { x = y = 0; draw(); });
      canvas.onpointerdown = ev => { drag = [ev.clientX,ev.clientY]; canvas.setPointerCapture(ev.pointerId); };
      canvas.onpointermove = ev => { if (!drag) return; const factor = canvas.width/canvas.getBoundingClientRect().width; x += (ev.clientX-drag[0])*factor; y += (ev.clientY-drag[1])*factor; drag = [ev.clientX,ev.clientY]; draw(); };
      canvas.onpointerup = canvas.onpointercancel = () => { drag = null; };
      d.querySelector('[data-original]').onclick = () => done(file);
      d.querySelector('[data-crop]').onclick = () => canvas.toBlob(blob => { if (blob) done(new File([blob],file.name.replace(/\.[^.]+$/,'')+'-crop.png',{type:'image/png'})); }, 'image/png');
      draw();
    });
  } finally { URL.revokeObjectURL(url); }
}
export async function uploadWithProgress(file, csrf, progress) {
  let dimensions;
  if (file.type.startsWith('image/') && 'createImageBitmap' in window) {
    try { const bitmap = await createImageBitmap(file); dimensions = [bitmap.width,bitmap.height]; bitmap.close(); } catch { /* Server still validates the file signature. */ }
  }
  return new Promise((resolve,reject) => {
    const xhr = new XMLHttpRequest(); xhr.open('POST','/api/admin/media'); xhr.timeout = 60000;
    if (dimensions) { xhr.setRequestHeader('X-Image-Width',String(dimensions[0])); xhr.setRequestHeader('X-Image-Height',String(dimensions[1])); }
    xhr.setRequestHeader('Content-Type',file.type); xhr.setRequestHeader('X-CSRF-Token',csrf); xhr.setRequestHeader('X-File-Name',encodeURIComponent(file.name));
    xhr.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded/event.total*100)); };
    const fail = message => reject(Object.assign(new Error(message), { status: xhr.status }));
    xhr.onerror = () => fail('Upload interrupted. Try again.');
    xhr.onabort = () => fail('Upload cancelled. Try again.');
    xhr.ontimeout = () => fail('Upload timed out. Try again.');
    xhr.onload = () => { if (new URLSearchParams(location.search).has('debug')) console.debug('[portfolio-upload]', JSON.stringify({ event: 'upload.response', status: xhr.status })); let data; try { data = JSON.parse(xhr.responseText); } catch { fail('Unexpected upload response.'); return; } if (xhr.status >= 200 && xhr.status < 300) resolve(data); else fail(data.error || 'Upload failed.'); };
    xhr.send(file);
  });
}

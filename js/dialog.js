// Styled confirmation dialogs (native <dialog>), used instead of the browser's confirm() / prompt().

// `title` and `message` are a string or a list of parts: strings and { strong: text } (shown in bold).
function appendParts(el, content) {
  for (const part of Array.isArray(content) ? content : [content]) {
    if (typeof part === 'string') el.append(part);
    else {
      const strong = document.createElement('strong');
      strong.textContent = part.strong;
      el.append(strong);
    }
  }
}

// confirmDialog({ title, message, details?, confirmLabel?, cancelLabel?, danger?, requireText? }) -> Promise<boolean>
// With `requireText`, the confirm button stays disabled until that exact text is typed.
export function confirmDialog({
  title,
  message,
  details = [],
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  danger = false,
  requireText = null,
}) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = `dialog${danger ? ' dialog-danger' : ''}`;
    dialog.setAttribute('aria-labelledby', 'dialog-title');

    const form = document.createElement('form');
    form.method = 'dialog';
    form.className = 'dialog-body';

    const heading = document.createElement('h2');
    heading.id = 'dialog-title';
    appendParts(heading, title);

    const text = document.createElement('p');
    appendParts(text, message);
    form.append(heading, text);

    if (details.length) {
      const list = document.createElement('ul');
      list.className = 'dialog-details';
      for (const item of details) {
        const li = document.createElement('li');
        li.textContent = item;
        list.append(li);
      }
      form.append(list);
    }

    let input = null;
    if (requireText) {
      const label = document.createElement('label');
      label.className = 'field';
      const hint = document.createElement('span');
      hint.append('Para confirmar, escribe ');
      const code = document.createElement('code');
      code.textContent = requireText;
      hint.append(code);
      input = document.createElement('input');
      input.type = 'text';
      input.autocomplete = 'off';
      input.spellcheck = false;
      label.append(hint, input);
      form.append(label);
    }

    const actions = document.createElement('div');
    actions.className = 'actions dialog-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn btn-secondary';
    cancel.textContent = cancelLabel;
    const ok = document.createElement('button');
    ok.type = 'submit';
    ok.value = 'ok';
    ok.className = `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`;
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    form.append(actions);
    dialog.append(form);

    if (input) {
      ok.disabled = true;
      input.addEventListener('input', () => {
        ok.disabled = input.value.trim() !== requireText;
      });
    }

    cancel.addEventListener('click', () => dialog.close(''));
    // Click on the backdrop closes without confirming.
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close('');
    });
    dialog.addEventListener('close', () => {
      const confirmed = dialog.returnValue === 'ok';
      dialog.remove();
      resolve(confirmed);
    });

    document.body.append(dialog);
    dialog.showModal();
    (input || cancel).focus();
  });
}

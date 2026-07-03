    function formatNum(num, field) {
      if (!num || isNaN(num)) return (field && field.startsWith('bol')) ? '0' : '0.00';
      return (field && field.startsWith('bol')) ? Math.round(num) : parseFloat(num).toFixed(2);
    }

    function applyCellColor(el, realStr, planStr) {
      if (!el) return;
      const pStr = String(planStr || '').trim();
      if (pStr === '' || isNaN(pStr) || parseFloat(pStr) <= 0) {
        el.style.backgroundColor = '#ef4444'; 
        el.style.color = '#fff';
        return;
      }
      const r = Math.round((parseFloat(realStr) || 0) * 100);
      const p = Math.round(parseFloat(pStr) * 100);
      if (r >= p) {
        el.style.backgroundColor = '#107c41'; // Excel Green
        el.style.color = '#fff';
      } else if (r >= p * 0.9) {
        el.style.backgroundColor = '#f59e0b'; // Amber/Yellow
        el.style.color = '#fff';
      } else {
        el.style.backgroundColor = '#ef4444'; // Red
        el.style.color = '#fff';
      }
    }

    function updateProg(id, pVal, rVal) {
      const p = parseFloat(pVal || 0);
      const r = parseFloat(rVal || 0);
      let pct = 0;
      if (p > 0) pct = Math.min(100, Math.round((r / p) * 100));
      const textEl = document.getElementById(`prog-${id}`);
      const barEl = document.getElementById(`bar-${id}`);
      if (textEl) textEl.textContent = pct + '%';
      if (barEl) {
        barEl.style.width = pct + '%';
        // Lógica estricta estática: <50% Rojo, 50-89% Naranja, >=90% Verde Excel
        let bgColor;
        if (pct < 50) {
          bgColor = '#ef4444'; // Rojo
        } else if (pct < 90) {
          bgColor = '#f59e0b'; // Ámbar/Naranja
        } else {
          bgColor = '#107c41'; // Verde Excel
        }
        if (pct === 0) {
          barEl.style.backgroundColor = 'transparent';
          barEl.style.boxShadow = 'none';
        } else {
          barEl.style.backgroundColor = bgColor;
          barEl.style.boxShadow = 'none';
        }
      }
    }

    function handleInput(e) {
      const el = e.target;
      const prom = el.dataset.prom;
      const field = el.dataset.field;
      let val = el.value;
      if (el.tagName === 'INPUT') {
        val = val.replace(',', '.');
        if (val !== '' && isNaN(val)) val = '';
      }
      if (!volData[prom]) volData[prom] = {};
      volData[prom][field] = val;
      calcTotals();
      const btnSync = document.getElementById('btn-sync');
      if (btnSync) {
        if (window.currentCloudState && JSON.stringify(volData) === window.currentCloudState) {
          btnSync.classList.remove('btn-needs-sync');
        } else {
          btnSync.classList.add('btn-needs-sync');
        }
      }
    }

    function toggleFocoExtra(num) {
      document.getElementById('main-table').classList.toggle(`hide-f${num}-extra`);
    }

    function toggleObjExtra(num) {
      const table = document.getElementById('main-table');
      table.classList.toggle(`hide-f${num}-obj`);
      const header = document.getElementById(`header-foco-${num}`);
      if (header) {
        if (table.classList.contains(`hide-f${num}-obj`)) {
          header.setAttribute('colspan', '3');
        } else {
          header.setAttribute('colspan', '6');
        }
      }
    }

    function renderTables() {
      tbody.innerHTML = '';
      const fragment = document.createDocumentFragment();
      const diasRestantes = getDiasHabilesRestantes(document.getElementById('date-input').value);
      for (const spv in SPV_DATA) {
        const promotores = SPV_DATA[spv];
        const spvId = spv.replace(/\s+/g, '-');
        // Fila del SPV (Cabecera y Subtotales)
        const trSpv = document.createElement('tr');
        trSpv.className = 'spv-header';
        trSpv.innerHTML = `
          <td class="spv-name" onclick="toggleSpv('${spvId}')" title="Clic para expandir/colapsar">
            <span class="toggle-icon" id="icon-${spvId}">▼</span>${spv}
          </td>
          <td id="tot-${spvId}-f1-p" class="tot-val">0.00</td>
          <td id="tot-${spvId}-obj-f1" class="tot-val f1-obj">0.00</td>
          <td id="tot-${spvId}-f1-obj-v" class="tot-val f1-obj">0.00</td>
          <td id="tot-${spvId}-f1-med" class="tot-val f1-obj" style="color:var(--c-yellow2)">0.00</td>
          <td id="tot-${spvId}-f1-v" class="tot-val">0.00</td>
          <td class="progress-cell"><span id="prog-${spvId}-f1">0%</span><div class="progress-bar-bg"><div id="bar-${spvId}-f1" class="progress-bar-fill" style="width:0%"></div></div></td>
          <td id="tot-${spvId}-f1-cv" class="tot-val f1-extra">0.00</td>
          <td id="tot-${spvId}-f1-ac" class="tot-val f1-extra">0.00</td>
          <td id="tot-${spvId}-f1-bc" class="tot-val f1-extra">0.00</td>
          <td id="tot-${spvId}-f1-lt" class="tot-val f1-extra">0.00</td>
          <td id="tot-${spvId}-f2-p" class="tot-val">0.00</td>
          <td id="tot-${spvId}-obj-f2" class="tot-val f2-obj">0.00</td>
          <td id="tot-${spvId}-f2-obj-v" class="tot-val f2-obj">0.00</td>
          <td id="tot-${spvId}-f2-med" class="tot-val f2-obj" style="color:var(--c-yellow2)">0.00</td>
          <td id="tot-${spvId}-f2-v" class="tot-val">0.00</td>
          <td class="progress-cell"><span id="prog-${spvId}-f2">0%</span><div class="progress-bar-bg"><div id="bar-${spvId}-f2" class="progress-bar-fill" style="width:0%"></div></div></td>
	  <td id="tot-${spvId}-f2-ung" class="tot-val f2-extra">0.00</td>
          <td id="tot-${spvId}-f2-up" class="tot-val f2-extra">0.00</td>
          <td id="tot-${spvId}-f2-rb" class="tot-val f2-extra">0.00</td>
          <td id="tot-${spvId}-f2-ag" class="tot-val f2-extra">0.00</td>
          <td colspan="4" class="progress-cell"><span id="prog-${spvId}-k1">0%</span><div class="progress-bar-bg"><div id="bar-${spvId}-k1" class="progress-bar-fill" style="width:0%"></div></div></td>
          <td colspan="4" class="progress-cell"><span id="prog-${spvId}-k2">0%</span><div class="progress-bar-bg"><div id="bar-${spvId}-k2" class="progress-bar-fill" style="width:0%"></div></div></td>
          <td id="tot-${spvId}-bol-p" class="tot-val">0</td>
          <td id="tot-${spvId}-bol-v" class="tot-val">0</td>
          <td class="progress-cell"><span id="prog-${spvId}-bol">0%</span><div class="progress-bar-bg"><div id="bar-${spvId}-bol" class="progress-bar-fill" style="width:0%"></div></div></td>
        `;
        promotores.forEach(p => {
          const tr = document.createElement('tr');
          tr.className = `prom-row-${spvId}`;
          const isLemos = (p === 'LEMOS PATRICIA');
          const tdBg = isLemos ? 'background: var(--acc) !important;' : '';
          const inpStyle = isLemos ? 'style="color: #ffffff !important; background: var(--acc) !important;"' : '';
          const planReadonly = ''; // Habilitado para supervisor y auditor
          tr.innerHTML = `
            <td class="text-left prom-name-cell" onclick="deletePromoterData('${p}')" title="Borrar planificación de ${p}" style="${isLemos ? 'background: var(--acc); color: #fff;' : ''}">${p}</td>
            <!-- I -->
            <td style="${tdBg}"><input type="text" class="cell-input plan" ${inpStyle} data-prom="${p}" data-field="f1-p" value="${val(p, 'f1-p')}" ${planReadonly}></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#fee2e2'}" class="f1-obj"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} value="${formatNum(val(p, 'obj-f1'))}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#fee2e2'}" class="f1-obj"><input type="text" class="cell-input real plan" readonly tabindex="-1" data-prom="${p}" data-field="acum-f1" ${inpStyle} value="${formatNum(val(p, 'acum-f1'))}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#fecaca'}" class="f1-obj"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} value="${formatNum(Math.max(0, (parseFloat(val(p, 'obj-f1') || 0) - parseFloat(val(p, 'acum-f1') || 0)) / diasRestantes))}"></td>
            <td style="${tdBg}"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f1-v" value="${val(p, 'f1-v')}"></td>
            <td class="progress-cell"><span id="prog-${p}-f1">0%</span><div class="progress-bar-bg"><div id="bar-${p}-f1" class="progress-bar-fill" style="width:0%"></div></div></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#fef9c3'}" class="f1-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f1-cv" value="${val(p, 'f1-cv')}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#dcfce7'}" class="f1-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f1-ac" value="${val(p, 'f1-ac')}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#f1f5f9'}" class="f1-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f1-bc" value="${val(p, 'f1-bc')}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#ffedd5'}" class="f1-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f1-lt" value="${val(p, 'f1-lt')}"></td>
            <!-- II -->
            <td style="${tdBg}"><input type="text" class="cell-input plan" ${inpStyle} data-prom="${p}" data-field="f2-p" value="${val(p, 'f2-p')}" ${planReadonly}></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#dbeafe'}" class="f2-obj"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} value="${formatNum(val(p, 'obj-f2'))}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#dbeafe'}" class="f2-obj"><input type="text" class="cell-input real plan" readonly tabindex="-1" data-prom="${p}" data-field="acum-f2" ${inpStyle} value="${formatNum(val(p, 'acum-f2'))}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#bfdbfe'}" class="f2-obj"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} value="${formatNum(Math.max(0, (parseFloat(val(p, 'obj-f2') || 0) - parseFloat(val(p, 'acum-f2') || 0)) / diasRestantes))}"></td>
            <td style="${tdBg}"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f2-v" value="${val(p, 'f2-v')}"></td>
            <td class="progress-cell"><span id="prog-${p}-f2">0%</span><div class="progress-bar-bg"><div id="bar-${p}-f2" class="progress-bar-fill" style="width:0%"></div></div></td>
	    <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#fce7f3'}" class="f2-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f2-ung" value="${val(p,'f2-ung')}">
</td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#fce7f3'}" class="f2-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f2-up" value="${val(p, 'f2-up')}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#bfdbfe'}" class="f2-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f2-rb" value="${val(p, 'f2-rb')}"></td>
            <td style="${isLemos ? 'background: var(--acc) !important;' : 'background:#e0f2fe'}" class="f2-extra"><input type="text" class="cell-input real" readonly tabindex="-1" ${inpStyle} data-prom="${p}" data-field="f2-ag" value="${val(p, 'f2-ag')}"></td>
            <!-- III -->
            ${isLemos ? `
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            ` : `
            <td class="kpi-label-cell" style="background:#fef08a;">
              ${val(p, 'k1-met') ? '<span style="color:var(--muted)">' + val(p, 'k1-met') + ':</span> ' : ''}${(val(p, 'k1-tar') || '-').toUpperCase()}
            </td>
            <td style="background:#ffffff"><input type="text" class="cell-input plan" data-prom="${p}" data-field="k1-p" value="${val(p, 'k1-p')}" ${planReadonly}></td>
            <td style="background:#ffffff"><input type="text" class="cell-input real" readonly tabindex="-1" data-prom="${p}" data-field="k1-v" value="${val(p, 'k1-v')}"></td>
            <td class="progress-cell"><span id="prog-${p}-k1">0%</span><div class="progress-bar-bg"><div id="bar-${p}-k1" class="progress-bar-fill" style="width:0%"></div></div></td>
            `}
            <!-- IV -->
            ${isLemos ? `
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            ` : `
            <td class="kpi-label-cell" style="background:#e9d5ff;">
              ${val(p, 'k2-met') ? '<span style="color:var(--muted)">' + val(p, 'k2-met') + ':</span> ' : ''}${(val(p, 'k2-tar') || '-').toUpperCase()}
            </td>
            <td style="background:#ffffff"><input type="text" class="cell-input plan" data-prom="${p}" data-field="k2-p" value="${val(p, 'k2-p')}" ${planReadonly}></td>
            <td style="background:#ffffff"><input type="text" class="cell-input real" readonly tabindex="-1" data-prom="${p}" data-field="k2-v" value="${val(p, 'k2-v')}"></td>
            <td class="progress-cell"><span id="prog-${p}-k2">0%</span><div class="progress-bar-bg"><div id="bar-${p}-k2" class="progress-bar-fill" style="width:0%"></div></div></td>
            `}
            <!-- V (Boletas) -->
            ${isLemos ? `
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            <td style="background: var(--acc) !important; border-color: var(--acc) !important;"></td>
            ` : `
            <td style="background:#bfdbfe"><input type="text" class="cell-input plan" data-prom="${p}" data-field="bol-p" value="${val(p, 'bol-p')}" ${planReadonly}></td>
            <td style="background:#bfdbfe"><input type="text" class="cell-input real" readonly tabindex="-1" data-prom="${p}" data-field="bol-v" value="${val(p, 'bol-v')}" style="font-weight:bold"></td>
            <td class="progress-cell"><span id="prog-${p}-bol">0%</span><div class="progress-bar-bg"><div id="bar-${p}-bol" class="progress-bar-fill" style="width:0%"></div></div></td>
            `}
          `;
          fragment.appendChild(tr);
        });
        if (spv !== 'LEMOS PATRICIA') {
          fragment.appendChild(trSpv);
        }
      }
      tbody.appendChild(fragment);
      document.querySelectorAll('.cell-input').forEach(inp => {
        inp.addEventListener('input', handleInput);
        inp.addEventListener('focus', function () { 
          this.dataset.origVal = this.value; // Guardar valor original
          const prom = this.dataset.prom;
          const field = this.dataset.field;
          this._origVolData = (prom && field && volData[prom]) ? volData[prom][field] : undefined;
          this.select(); 
        });
        inp.addEventListener('blur', function () {
          if (this._isEscaping) {
            this._isEscaping = false;
            return;
          }
          if (this.value && !isNaN(this.value.replace(',', '.'))) {
            this.value = formatNum(this.value.replace(',', '.'));
            handleInput({ target: this });
          }
        });
        inp.addEventListener('keydown', function(e) {
          const key = e.key;
          if (key === 'Escape') {
            if (this.dataset.origVal !== undefined) {
              this.value = this.dataset.origVal;
              // Restaurar en volData sin marcar como cambio pendiente
              const prom = this.dataset.prom;
              const field = this.dataset.field;
              if (prom && field) {
                if (!volData[prom]) volData[prom] = {};
                
                if (this._origVolData !== undefined) {
                  volData[prom][field] = this._origVolData;
                } else {
                  delete volData[prom][field];
                  if (Object.keys(volData[prom]).length === 0) {
                    delete volData[prom];
                  }
                }
                
                calcTotals();
                // Re-evaluar estado del botón sync correctamente
                const btnSync = document.getElementById('btn-sync');
                if (btnSync) {
                  if (window.currentCloudState && JSON.stringify(volData) === window.currentCloudState) {
                    btnSync.classList.remove('btn-needs-sync');
                  } else {
                    btnSync.classList.add('btn-needs-sync');
                  }
                }
              }
            }
            this._isEscaping = true;
            this.blur();
            return;
          }
          if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(key)) return;
          const td = this.closest('td');
          const tr = td.closest('tr');
          const tbody = tr.closest('tbody');
          if (key === 'ArrowLeft' || key === 'ArrowRight') {
            // Solo navegar si el cursor está al inicio/final del texto
            if (key === 'ArrowLeft' && this.selectionStart > 0) return;
            if (key === 'ArrowRight' && this.selectionEnd < this.value.length) return;
            const rowInputs = Array.from(tr.querySelectorAll('.cell-input:not([readonly])'));
            const index = rowInputs.indexOf(this);
            e.preventDefault();
            if (key === 'ArrowLeft' && index > 0) {
              rowInputs[index - 1].focus();
            } else if (key === 'ArrowRight' && index < rowInputs.length - 1) {
              rowInputs[index + 1].focus();
            }
          } else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'Enter') {
            e.preventDefault();
            const rows = Array.from(tbody.querySelectorAll('tr:not(.spv-header)'));
            const rowIndex = rows.indexOf(tr);
            const tds = Array.from(tr.querySelectorAll('td'));
            const tdIndex = tds.indexOf(td);
            let targetRowIndex = rowIndex;
            if (key === 'ArrowUp') targetRowIndex--;
            else if (key === 'ArrowDown' || key === 'Enter') targetRowIndex++;
            if (targetRowIndex >= 0 && targetRowIndex < rows.length) {
              const targetTr = rows[targetRowIndex];
              const targetTd = targetTr.querySelectorAll('td')[tdIndex];
              if (targetTd) {
                const targetInput = targetTd.querySelector('.cell-input:not([readonly])');
                if (targetInput) targetInput.focus();
              }
            }
          }
        });
      });
      calcTotals();
    }

    // Notificación Toast premium para WhatsApp
    function showCopyToast(textStr) {
      const oldToast = document.getElementById('emcala-toast');
      if (oldToast) oldToast.remove();
      const toast = document.createElement('div');
      toast.id = 'emcala-toast';
      toast.className = 'toast-container';
      toast.innerHTML = `
        <div class="toast-title">📸 ¡Foto Copiada para WhatsApp!</div>
        <div class="toast-body">
          La tabla se copió al portapapeles. Ya podés pegarla con <b>Ctrl+V</b> en tu chat.
        </div>
        <button class="toast-btn" id="toast-btn-copy-txt">📋 Copiar Título</button>
      `;
      document.body.appendChild(toast);
      setTimeout(() => toast.classList.add('show'), 50);
      const copyBtn = toast.querySelector('#toast-btn-copy-txt');
      copyBtn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(textStr);
          copyBtn.innerHTML = '✅ ¡Texto Copiado! ✓';
          copyBtn.classList.add('copied');
          setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 400);
          }, 1500);
        } catch (err) {
          console.error(err);
          alert('No se pudo copiar el texto.');
        }
      });
      // Auto dismiss a los 20 segundos
      setTimeout(() => {
        if (toast && toast.parentNode) {
          toast.classList.remove('show');
          setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
        }
      }, 20000);
    }
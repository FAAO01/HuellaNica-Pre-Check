(() => {
  const STORAGE_KEY = 'huellanica_precheck_db_v1';

  // Datos iniciales de demostración (Padrón veterinario simulado en Nicaragua)
  const INITIAL_DATA = {
    pets: [
      {
        id: 'HN-2026-1042',
        ownerId: '88881234',
        ownerDisplay: '8888-1234',
        name: 'Firulais',
        species: 'Perro',
        age: 'Adulto (1 - 7 años)',
        rabies: 'Vigente (Últimos 12 meses)'
      },
      {
        id: 'HN-2026-2089',
        ownerId: '0011204950004K',
        ownerDisplay: '001-120495-0004K',
        name: 'Luna',
        species: 'Gato',
        age: 'Cachorro (< 1 año)',
        rabies: 'Vigente (Últimos 12 meses)'
      }
    ],
    alerts: [],
    stats: {
      checks: 2,
      alerts: 0
    }
  };

  // Estado en memoria
  let state = loadState();
  let soundEnabled = true;
  let currentOwnerRaw = '';
  let currentOwnerNormalized = '';
  let selectedPetForAppt = null;
  let activeAlertId = null;

  // Referencias al DOM (Modal y Formularios)
  const verifyModal = document.getElementById('verify-modal');
  const btnOpenVerifyModal = document.getElementById('btn-open-verify-modal');
  const btnTopbarVerify = document.getElementById('btn-topbar-verify');
  const btnCloseModal = document.getElementById('btn-close-modal');

  const verifyForm = document.getElementById('verify-form');
  const inputIdentificador = document.getElementById('input-identificador');

  const stepVerify = document.getElementById('step-verify');
  const stepRegistered = document.getElementById('step-registered');
  const stepUnregistered = document.getElementById('step-unregistered');
  const stepSuccess = document.getElementById('step-success');

  const regOwnerId = document.getElementById('reg-owner-id');
  const registeredPetsContainer = document.getElementById('registered-pets-container');
  const existingApptTime = document.getElementById('existing-appt-time');
  const btnConfirmExisting = document.getElementById('btn-confirm-existing');
  const btnAddAnotherPet = document.getElementById('btn-add-another-pet');

  const alertIdentifierDisplay = document.getElementById('alert-identifier-display');
  const formRegistro = document.getElementById('form-registro');

  const statChecks = document.getElementById('stat-checks');
  const statAlerts = document.getElementById('stat-alerts');
  const statRegistered = document.getElementById('stat-registered');
  const alertsFeed = document.getElementById('alerts-feed');
  const registeredList = document.getElementById('registered-list');

  const btnToggleSound = document.getElementById('btn-toggle-sound');
  const soundIcon = document.getElementById('sound-icon');
  const soundLabel = document.getElementById('sound-label');
  const btnResetDemo = document.getElementById('btn-reset-demo');
  const toastContainer = document.getElementById('toast-container');

  // Inicialización
  renderClinicMonitor();

  // --- Control del Modal ---

  function openVerifyModal() {
    verifyModal.classList.remove('hidden');
    setTimeout(() => {
      inputIdentificador.focus();
    }, 50);
  }

  function closeVerifyModal() {
    verifyModal.classList.add('hidden');
  }

  btnOpenVerifyModal.addEventListener('click', openVerifyModal);
  btnTopbarVerify.addEventListener('click', openVerifyModal);
  btnCloseModal.addEventListener('click', closeVerifyModal);

  // Cerrar modal al hacer clic fuera del cuadro (en el fondo oscuro)
  verifyModal.addEventListener('click', (e) => {
    if (e.target === verifyModal) {
      closeVerifyModal();
    }
  });

  // Cerrar modal con la tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !verifyModal.classList.contains('hidden')) {
      closeVerifyModal();
    }
  });

  // --- Eventos de Flujo ---

  // 1. Envío de formulario de verificación desde el Modal
  verifyForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const raw = inputIdentificador.value.trim();
    if (!raw) return;

    closeVerifyModal();
    runVerification(raw);
  });

  // Chips de prueba rápida dentro del Modal
  document.querySelectorAll('[data-test-id]').forEach((chip) => {
    chip.addEventListener('click', () => {
      const testVal = chip.getAttribute('data-test-id');
      inputIdentificador.value = testVal;
      closeVerifyModal();
      runVerification(testVal);
    });
  });

  // Confirmar cita para mascota ya existente
  btnConfirmExisting.addEventListener('click', () => {
    if (!selectedPetForAppt) return;
    const turno = existingApptTime.value;
    showPassScreen(selectedPetForAppt, turno);
    showToast(
      'Cita Pre-Check Confirmada',
      `Turno reservado para ${selectedPetForAppt.name} (${turno}).`,
      'success'
    );
  });

  // Registrar una mascota adicional para un dueño ya existente
  btnAddAnotherPet.addEventListener('click', () => {
    alertIdentifierDisplay.textContent = currentOwnerRaw;
    activeAlertId = null;
    switchPanel('unregistered', 2);
  });

  // 3. Envío de formulario de Registro Exprés
  formRegistro.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('pet-name').value.trim();
    const species = document.getElementById('pet-species').value;
    const age = document.getElementById('pet-age').value;
    const rabies = document.getElementById('pet-rabies').value;
    const turno = document.getElementById('appt-time').value;

    if (!name || !species || !age || !rabies) return;

    const newPet = {
      id: generatePassCode(),
      ownerId: currentOwnerNormalized,
      ownerDisplay: currentOwnerRaw,
      name,
      species,
      age,
      rabies
    };

    state.pets.unshift(newPet);

    if (activeAlertId) {
      const alertItem = state.alerts.find((a) => a.id === activeAlertId);
      if (alertItem) {
        alertItem.status = 'REGISTRADO';
        alertItem.petName = name;
      }
    }

    saveState();
    renderClinicMonitor();
    formRegistro.reset();

    showPassScreen(newPet, turno);
    showToast(
      '📲 Expediente Creado y Cita Lista',
      `${name} (${species}) ha sido registrado. Recepción ya tiene su ficha clínica.`,
      'success'
    );
  });

  // Botones para volver al inicio y reabrir el modal de búsqueda
  document.querySelectorAll('.btn-back-start').forEach((btn) => {
    btn.addEventListener('click', () => {
      inputIdentificador.value = '';
      switchPanel('verify', 1);
      openVerifyModal();
    });
  });

  // Control de sonido
  btnToggleSound.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    soundIcon.textContent = soundEnabled ? '🔔' : '🔕';
    soundLabel.textContent = soundEnabled ? 'Sonido: ON' : 'Sonido: OFF';
  });

  // Reiniciar datos de demostración
  btnResetDemo.addEventListener('click', () => {
    localStorage.removeItem(STORAGE_KEY);
    state = loadState();
    renderClinicMonitor();
    inputIdentificador.value = '';
    closeVerifyModal();
    switchPanel('verify', 1);
    showToast('Demo Reiniciada', 'Se restauró la base de datos inicial de Nicaragua.', 'success');
  });

  // --- Lógica Central ---

  function runVerification(rawIdentifier) {
    currentOwnerRaw = rawIdentifier;
    currentOwnerNormalized = normalizeIdentifier(rawIdentifier);

    state.stats.checks += 1;

    const matchingPets = state.pets.filter(
      (pet) => pet.ownerId === currentOwnerNormalized
    );

    if (matchingPets.length > 0) {
      saveState();
      renderClinicMonitor();
      renderRegisteredPets(matchingPets);
      switchPanel('registered', 2);
    } else {
      triggerUnregisteredAlert(rawIdentifier);
    }
  }

  function triggerUnregisteredAlert(rawIdentifier) {
    state.stats.alerts += 1;

    const alertRecord = {
      id: 'ALT-' + Date.now(),
      identifier: rawIdentifier,
      time: getCurrentTime(),
      status: 'NO REGISTRADO',
      petName: null
    };

    activeAlertId = alertRecord.id;
    state.alerts.unshift(alertRecord);

    saveState();
    renderClinicMonitor();

    if (soundEnabled) {
      playAlertChime();
    }

    showToast(
      '⚠️ Alerta Automática Disparada',
      `El número ${rawIdentifier} no tiene mascota registrada. Se notificó a recepción y se envió enlace de registro.`,
      'warning'
    );

    alertIdentifierDisplay.textContent = rawIdentifier;
    switchPanel('unregistered', 2);
  }

  function renderRegisteredPets(pets) {
    regOwnerId.textContent = currentOwnerRaw;
    registeredPetsContainer.innerHTML = '';
    selectedPetForAppt = pets[0];

    pets.forEach((pet, index) => {
      const isPendingVaccine = !pet.rabies.startsWith('Vigente');
      const card = document.createElement('div');
      card.className = `pet-item-card ${index === 0 ? 'selected' : ''}`;
      card.innerHTML = `
        <div>
          <h4>${escapeHtml(pet.name)} (${escapeHtml(pet.species)})</h4>
          <span>${escapeHtml(pet.age)} • ID: ${escapeHtml(pet.id)}</span>
        </div>
        <span class="vaccine-tag ${isPendingVaccine ? 'pending' : ''}">
          Antirrábica: ${isPendingVaccine ? 'Refuerzo' : 'Al día'}
        </span>
      `;

      card.addEventListener('click', () => {
        document
          .querySelectorAll('.pet-item-card')
          .forEach((el) => el.classList.remove('selected'));
        card.classList.add('selected');
        selectedPetForAppt = pet;
      });

      registeredPetsContainer.appendChild(card);
    });
  }

  function showPassScreen(pet, turno) {
    document.getElementById('pass-code').textContent = pet.id;
    document.getElementById('pass-pet').textContent = pet.name;
    document.getElementById('pass-species-age').textContent = `${pet.species} • ${pet.age}`;
    document.getElementById('pass-owner').textContent = pet.ownerDisplay;
    document.getElementById('pass-rabies').textContent = pet.rabies;
    document.getElementById('pass-time').textContent = turno;

    switchPanel('success', 3);
  }

  function renderClinicMonitor() {
    statChecks.textContent = state.stats.checks;
    statAlerts.textContent = state.stats.alerts;
    statRegistered.textContent = state.pets.length;

    if (state.alerts.length === 0) {
      alertsFeed.innerHTML =
        '<p class="empty-msg">Aún no hay alertas en esta sesión. Abre el verificador y prueba un número no registrado.</p>';
    } else {
      alertsFeed.innerHTML = state.alerts
        .map((item) => {
          const isResolved = item.status === 'REGISTRADO';
          return `
            <div class="alert-log-item ${isResolved ? 'resolved' : ''}">
              <div class="alert-log-top">
                <span>${escapeHtml(item.identifier)}</span>
                <span class="alert-log-status">${escapeHtml(item.status)}</span>
              </div>
              <div class="alert-log-meta">
                ${
                  isResolved
                    ? `Completado: <strong>${escapeHtml(item.petName)}</strong> • ${item.time}`
                    : `Aviso enviado a cliente y recepción • ${item.time}`
                }
              </div>
            </div>
          `;
        })
        .join('');
    }

    registeredList.innerHTML = state.pets
      .slice(0, 6)
      .map(
        (pet) => `
        <li>
          <div>
            <strong>${escapeHtml(pet.name)}</strong> (${escapeHtml(pet.species)})
          </div>
          <span style="color: var(--text-muted); font-size: 0.78rem;">
            ${escapeHtml(pet.ownerDisplay)}
          </span>
        </li>
      `
      )
      .join('');
  }

  function switchPanel(panelName, stepNumber) {
    [stepVerify, stepRegistered, stepUnregistered, stepSuccess].forEach((panel) => {
      panel.classList.add('hidden');
    });

    if (panelName === 'verify') stepVerify.classList.remove('hidden');
    if (panelName === 'registered') stepRegistered.classList.remove('hidden');
    if (panelName === 'unregistered') stepUnregistered.classList.remove('hidden');
    if (panelName === 'success') stepSuccess.classList.remove('hidden');

    document.querySelectorAll('.step-item').forEach((item) => {
      const num = Number(item.getAttribute('data-step'));
      item.classList.remove('active', 'done');
      if (num === stepNumber) item.classList.add('active');
      if (num < stepNumber) item.classList.add('done');
    });
  }

  // --- Utilidades ---

  function normalizeIdentifier(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

  function generatePassCode() {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `HN-2026-${randomNum}`;
  }

  function getCurrentTime() {
    return new Date().toLocaleTimeString('es-NI', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function showToast(title, message, type = 'warning') {
    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : ''}`;
    toast.innerHTML = `
      <div class="toast-title">
        <span>${escapeHtml(title)}</span>
        <span style="font-size: 0.7rem; opacity: 0.7;">Ahora</span>
      </div>
      <div class="toast-body">${escapeHtml(message)}</div>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.25s ease';
      setTimeout(() => toast.remove(), 260);
    }, 5200);
  }

  function playAlertChime() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, now);
      osc1.frequency.setValueAtTime(880, now + 0.14);

      gain1.gain.setValueAtTime(0.12, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.42);
    } catch (_) {
      // Ignorar si el navegador bloquea audio automático
    }
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch (_) {
      // Fallback a datos iniciales
    }
    return JSON.parse(JSON.stringify(INITIAL_DATA));
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_) {
      // Ignorar errores de cuota en modo privado
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
  }
})();
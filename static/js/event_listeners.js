// static/js/event_listeners.js
import * as ui from './ui.js';
import * as utils from './utils.js';
// We need the handler functions, state, and uiElements to be passed in or imported
// For simplicity, let's pass them in the init function.

export function initEventListeners(state, uiElements, handlers, themeHandlers) {
    console.log("Initialisation des écouteurs d'événements...");

    // Bouton Nouvelle Partie
    if (uiElements.newGameButton) {
        uiElements.newGameButton.addEventListener('click', () => handlers.handleResetToInitialState(state, uiElements));
    } else { console.warn("Élément manquant: newGameButton"); }

    // Liste des Sessions (délégation)
    if (uiElements.sessionList) {
        uiElements.sessionList.addEventListener('click', (event) => {
            const clickedDeleteBtn = event.target.closest('.delete-session-btn');
            const clickedLi = event.target.closest('li[data-session-id]');

            if (clickedDeleteBtn) {
                event.stopPropagation();
                state.sessionIdToDelete = clickedDeleteBtn.dataset.sessionId; // Set state
                const nameSpan = clickedLi ? clickedLi.querySelector('.session-name') : null;
                const playerName = nameSpan ? nameSpan.textContent : `ID ${state.sessionIdToDelete}`;
                ui.showDeleteModal(
                    `Voulez-vous vraiment supprimer la partie de "${playerName}" (ID: ${state.sessionIdToDelete}) ? Cette action est irréversible.`,
                    uiElements.deleteConfirmModal,
                    uiElements.deleteConfirmMessage
                );
            } else if (clickedLi) {
                handlers.handleLoadGame(clickedLi.dataset.sessionId, state, uiElements); // Pass state
            }
        });
    } else { console.warn("Élément manquant: sessionList"); }

    // Boutons du Modal de Suppression
    if (uiElements.confirmDeleteBtn) {
        uiElements.confirmDeleteBtn.addEventListener('click', () => handlers.handleDeleteSession(state, uiElements)); // Pass state
    } else { console.warn("Élément manquant: confirmDeleteBtn"); }
    if (uiElements.cancelDeleteBtn) {
        uiElements.cancelDeleteBtn.addEventListener('click', () => ui.hideDeleteModal(uiElements.deleteConfirmModal));
    } else { console.warn("Élément manquant: cancelDeleteBtn"); }
    if (uiElements.deleteConfirmModal) {
         uiElements.deleteConfirmModal.addEventListener('click', (event) => {
             if (event.target === uiElements.deleteConfirmModal) { ui.hideDeleteModal(uiElements.deleteConfirmModal); }
         });
     } else { console.warn("Élément manquant: deleteConfirmModal"); }

    // Sélections Age, Genre, Nom, Slider
    if (uiElements.ageButtons) {
        uiElements.ageButtons.forEach(b => b.addEventListener('click', () => {
            state.selectedAgeGroup = b.dataset.age; // Set state
            uiElements.ageButtons.forEach(btn => btn.classList.remove('selected'));
            b.classList.add('selected');
            if(uiElements.genderSelectionContainer) uiElements.genderSelectionContainer.style.display = 'block';
            ui.checkAndEnableThemeControls(state, uiElements); // Pass state object
        }));
    } else { console.warn("Éléments manquants: ageButtons"); }

    if (uiElements.genderButtons) {
        uiElements.genderButtons.forEach(b => b.addEventListener('click', () => {
            state.selectedGender = b.dataset.gender; // Set state
            uiElements.genderButtons.forEach(btn => btn.classList.remove('selected'));
            b.classList.add('selected');
            if (uiElements.nameInputContainer) uiElements.nameInputContainer.style.display = 'block';
            if (uiElements.playerNameInput) uiElements.playerNameInput.focus();
             ui.checkAndEnableThemeControls(state, uiElements); // Pass state object
        }));
    } else { console.warn("Éléments manquants: genderButtons"); }

    if (uiElements.playerNameInput) {
        uiElements.playerNameInput.addEventListener('input', () => {
             state.selectedPlayerName = uiElements.playerNameInput.value.trim(); // Set state
             ui.checkAndEnableThemeControls(state, uiElements); // Pass state object
         });
    } else { console.warn("Élément manquant: playerNameInput"); }

    if (uiElements.turnCountSlider) {
        uiElements.turnCountSlider.addEventListener('input', () => {
            state.selectedTurnCount = parseInt(uiElements.turnCountSlider.value, 10); // Set state
            if (uiElements.turnCountValueSpan) uiElements.turnCountValueSpan.textContent = `${state.selectedTurnCount} tours`;
        });
    } else { console.warn("Élément manquant: turnCountSlider"); }

    // Sélection Thème
    if (uiElements.themeButtonsContainer) {
        uiElements.themeButtonsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-theme]');
            if (btn && !btn.classList.contains('disabled') && btn.style.pointerEvents !== 'none') {
                // Check global state before starting
                if (state.selectedAgeGroup && state.selectedGender && state.selectedPlayerName && state.selectedPlayerName.trim() !== '' && state.selectedTurnCount) {
                    state.selectedTheme = btn.dataset.theme; // Set state
                    handlers.handleStartNewGame(state, uiElements); // Pass state
                } else {
                    alert("Complétez Age, Genre, Nom et Durée avant de choisir un thème.");
                }
            }
        });
    } else { console.warn("Élément manquant: themeButtonsContainer"); }

    // Actions du Chat
    if (uiElements.sendButton) {
        uiElements.sendButton.addEventListener('click', () => {
             if (state.currentSessionId && uiElements.userInput.value) {
                 handlers.handleSendMessage(uiElements.userInput.value, state, uiElements); // Pass state
             }
         });
     } else { console.warn("Élément manquant: sendButton"); }

    if (uiElements.userInput) {
        uiElements.userInput.addEventListener('keypress', (e) => {
             if (e.key === 'Enter') {
                 e.preventDefault();
                 if (state.currentSessionId && uiElements.userInput.value) {
                    handlers.handleSendMessage(uiElements.userInput.value, state, uiElements); // Pass state
                 }
             }
         });
     } else { console.warn("Élément manquant: userInput"); }

    if (uiElements.choiceButtons) {
        uiElements.choiceButtons.forEach(b => b.addEventListener('click', () => {
            if (!state.currentSessionId) return;
            const letter = b.dataset.choice;
            const text = utils.extractChoiceTextFromHistory(letter, state.chatHistory); // Use state.chatHistory
            const display = text ? `Choix ${letter}: "${text}"` : `Choix ${letter}`;
            handlers.handleSendMessage(letter, state, uiElements, display); // Pass state
        }));
    } else { console.warn("Éléments manquants: choiceButtons"); }

    if (uiElements.continueButton) {
        uiElements.continueButton.addEventListener('click', () => {
             if (!state.currentSessionId) return;
             handlers.handleSendMessage("Continue l'histoire...", state, uiElements); // Pass state
         });
     } else { console.warn("Élément manquant: continueButton"); }

    if (uiElements.inventoryButton) {
        uiElements.inventoryButton.addEventListener('click', () => {
            if (!state.currentSessionId) return;
            handlers.handleSendMessage("Quel est mon inventaire ?", state, uiElements, "Vérifier l'inventaire"); // Pass state
        });
    } else { console.warn("Élément manquant: inventoryButton"); }

    // --- NOUVEL ÉCOUTEUR ---
    if (uiElements.sidebarToggle && uiElements.appContainer) {
        uiElements.sidebarToggle.addEventListener('click', () => {
            uiElements.appContainer.classList.toggle('sidebar-hidden');
            // Optionnel: Sauvegarder l'état dans localStorage si tu veux que ça persiste
            // try {
            //    localStorage.setItem('sidebarHidden', uiElements.appContainer.classList.contains('sidebar-hidden'));
            // } catch (e) { console.warn("LocalStorage non dispo"); }
        });
    } else { console.warn("Élément manquant: sidebarToggle ou appContainer"); }
    // --- FIN NOUVEL ÉCOUTEUR ---

    // Écouteur pour le bouton Dark Mode
    if (uiElements.darkModeToggleButton && uiElements.bodyElement) {
        // Pass the bodyElement reference to the theme handler
        uiElements.darkModeToggleButton.addEventListener('click', () => themeHandlers.handleThemeToggle(uiElements.bodyElement));
    } else { console.warn("Élément manquant: darkModeToggleButton ou bodyElement"); }

    console.log("Écouteurs d'événements initialisés.");
}
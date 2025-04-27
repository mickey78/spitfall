// static/js/handlers.js
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as api from './api.js';

// Note: These functions rely on state variables and uiElements passed from the main script.

/**
 * Sends a message via API and updates UI.
 * @param {string} messageContent - The raw message content.
 * @param {object} state - Reference to the global state object.
 * @param {object} uiElements - Reference to the UI elements object.
 * @param {string | null} displayMessageOverride - Text to display in chat for the user message.
 */
export async function handleSendMessage(messageContent, state, uiElements, displayMessageOverride = null) {
    if (!state.currentSessionId) return;

    const messageToSend = messageContent.trim();
    if (messageToSend === '') return;

    const messageToDisplay = displayMessageOverride || messageToSend;
    ui.addMessage(messageToDisplay, 'user', uiElements.chatbox, state.selectedPlayerName); // Use state.selectedPlayerName

    if (document.activeElement === uiElements.userInput || document.activeElement === uiElements.sendButton) {
        uiElements.userInput.value = '';
    }

    const result = await api.sendMessage(messageToSend, state.chatHistory, state.currentSessionId, ui.addMessage, ui.setInputDisabledState, uiElements);

    if (result.success && result.data) {
        state.chatHistory = result.data.history; // Update state directly
        ui.addMessage(result.data.reply, 'ai', uiElements.chatbox, null);
        ui.updateUITimestampAndTitle(state.currentSessionId, state.selectedTheme, state.selectedPlayerName, new Date(), uiElements.mainTitleElement, uiElements.sessionList, utils.formatDisplayDate);
        state.currentTurnNumber++; // Update state
        ui.updateTurnCounterDisplay(state.currentTurnNumber, state.totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
    }
    // Errors handled by api.sendMessage
}

/**
 * Starts a new game via API and updates UI.
 * @param {object} state - Reference to the global state object.
 * @param {object} uiElements - Reference to the UI elements object.
 */
export async function handleStartNewGame(state, uiElements) {
    // Assume state.selectedTheme, state.selectedAgeGroup, etc., are set via event listeners
    state.selectedTurnCount = parseInt(uiElements.turnCountSlider.value, 10); // Update state

    if (!state.selectedTheme || !state.selectedAgeGroup || !state.selectedGender || !state.selectedPlayerName || state.selectedPlayerName.trim() === '' || !state.selectedTurnCount) {
        alert("Erreur: Infos manquantes (Thème, Age, Genre, Nom, Durée).");
        return;
    }

    // Update state
    state.totalTurnCount = state.selectedTurnCount;
    state.currentTurnNumber = 0;
    state.currentSessionId = null;
    state.chatHistory = [];

    // Initial UI Updates
    const initialTime = new Date();
    if (uiElements.mainTitleElement) {
        uiElements.mainTitleElement.textContent = `${state.selectedTheme} - ${state.selectedPlayerName} (Activité: ${utils.formatDisplayDate(initialTime)})`;
    }
    uiElements.themeSelectionDiv.style.display = 'none';
    uiElements.chatAreaDiv.style.display = 'flex';
    uiElements.chatbox.innerHTML = ''; // Clear chat

    // --- MODIFICATIONS ---
    if (uiElements.appContainer) uiElements.appContainer.classList.add('sidebar-hidden'); // Cache la sidebar
    if (uiElements.sidebarToggle) uiElements.sidebarToggle.style.display = 'block'; // Affiche le bouton toggle
    // --- FIN MODIFICATIONS ---

    ui.addMessage(`Lancement de l'aventure "${state.selectedTheme}" pour ${state.selectedPlayerName} (${state.selectedGender}, ${state.selectedAgeGroup}) (env. ${state.totalTurnCount} tours)...`, 'ai', uiElements.chatbox, null);

    const gameData = {
        theme: state.selectedTheme,
        ageGroup: state.selectedAgeGroup,
        gender: state.selectedGender,
        playerName: state.selectedPlayerName,
        turnCount: state.totalTurnCount
    };

    // Call API
    const result = await api.startNewGame(gameData, ui.addMessage, ui.setInputDisabledState, uiElements);

    if (result.success && result.data) {
        state.chatHistory = result.data.history;
        state.currentSessionId = result.data.session_id;
        ui.addMessage(result.data.reply, 'ai', uiElements.chatbox, null);

        if (!state.currentSessionId) {
            console.error("ID de session non reçu après startNewGame.");
            ui.addMessage("Erreur: La sauvegarde initiale n'a pas pu être créée.", 'ai', uiElements.chatbox, null);
        } else {
            console.log(`Nouvelle partie démarrée. Session ID: ${state.currentSessionId}, Tours: ${state.totalTurnCount}`);
            await refreshSessionList(state, uiElements); // Pass state
            state.currentTurnNumber = 1;
            ui.setActiveSessionIndicator(state.currentSessionId, uiElements.sessionList);
            ui.updateTurnCounterDisplay(state.currentTurnNumber, state.totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
        }
    } else {
        handleResetToInitialState(state, uiElements); // Reset on failure, pass state
    }
    ui.setInputDisabledState(false, uiElements); // Ensure inputs are enabled
}

/**
 * Loads a game session via API and updates UI.
 * @param {number} sessionId - The ID of the session to load.
 * @param {object} state - Reference to the global state object.
 * @param {object} uiElements - Reference to the UI elements object.
 */
export async function handleLoadGame(sessionId, state, uiElements) {
     console.log(`Coordination chargement session ID: ${sessionId}`);
    ui.setInputDisabledState(true, uiElements);
    uiElements.chatbox.innerHTML = '';
    ui.addMessage('Chargement de la partie...', 'ai', uiElements.chatbox, null);
    uiElements.themeSelectionDiv.style.display = 'none';
    uiElements.chatAreaDiv.style.display = 'flex';

    // --- MODIFICATIONS ---
    if (uiElements.appContainer) uiElements.appContainer.classList.add('sidebar-hidden'); // Cache la sidebar
    if (uiElements.sidebarToggle) uiElements.sidebarToggle.style.display = 'block'; // Affiche le bouton toggle
    // --- FIN MODIFICATIONS ---

    state.currentTurnNumber = 0;
    state.totalTurnCount = 0;

    const result = await api.loadGame(sessionId);

    if (result.success && result.data) {
        // Update global state
        state.currentSessionId = result.data.id;
        state.selectedPlayerName = result.data.player_name;
        state.selectedTheme = result.data.theme;
        state.selectedAgeGroup = result.data.age_group;
        state.selectedGender = result.data.gender;
        state.chatHistory = result.data.history || [];
        state.totalTurnCount = result.data.initial_turn_count || 0;

        // Update UI
        ui.updateUITimestampAndTitle(state.currentSessionId, state.selectedTheme, state.selectedPlayerName, result.data.last_played, uiElements.mainTitleElement, uiElements.sessionList, utils.formatDisplayDate);
        uiElements.chatbox.innerHTML = '';
        state.chatHistory.forEach(msg => ui.addMessage(msg.content, msg.role === 'assistant' ? 'ai' : 'user', uiElements.chatbox, state.selectedPlayerName)); // Corrected role mapping

        state.currentTurnNumber = state.chatHistory.filter(msg => msg.role === 'assistant').length; // Recalculate turn number
        ui.updateTurnCounterDisplay(state.currentTurnNumber, state.totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
        ui.addMessage(`Reprise de "${state.selectedTheme}" pour ${state.selectedPlayerName}. (Tour ${state.currentTurnNumber}/${state.totalTurnCount||'? '})`, 'ai', uiElements.chatbox, null);
        ui.setActiveSessionIndicator(state.currentSessionId, uiElements.sessionList);
        console.log(`Session ${state.currentSessionId} chargée. Tour: ${state.currentTurnNumber}/${state.totalTurnCount}`);
    } else {
        console.error(`Erreur chargement ${sessionId}:`, result.error);
        uiElements.chatbox.innerHTML = '';
        ui.addMessage(`Erreur chargement: ${result.error || 'Erreur inconnue'}.`, 'ai', uiElements.chatbox, null);
        handleResetToInitialState(state, uiElements); // Reset on failure
    }
    ui.setInputDisabledState(false, uiElements);
}

/**
 * Refreshes the session list from the API.
 * @param {object} state - Reference to the global state object.
 * @param {object} uiElements - Reference to the UI elements object.
 */
export async function refreshSessionList(state, uiElements) {
    uiElements.sessionList.innerHTML = '<li class="loading-sessions">Chargement...</li>';
    const result = await api.loadSessionList();

    if (result.success && result.data) {
        ui.displaySessionList(result.data, uiElements.sessionList, utils.formatDisplayDate, state.currentSessionId); // Pass state.currentSessionId
    } else {
        console.error("Erreur refreshSessionList:", result.error);
        uiElements.sessionList.innerHTML = `<li class="no-sessions">Erreur chargement (${result.error || 'inconnue'}).</li>`;
    }
}

/**
 * Handles the deletion of a session after confirmation.
 * @param {object} state - Reference to the global state object.
 * @param {object} uiElements - Reference to the UI elements object.
 */
export async function handleDeleteSession(state, uiElements) {
     if (!state.sessionIdToDelete) return;
    const id = state.sessionIdToDelete;
    console.log(`Coordination suppression session ID: ${id}`);
    ui.hideDeleteModal(uiElements.deleteConfirmModal);

    const result = await api.executeDeleteSession(id);

    if (result.success) {
        console.log(`Session ${id} supprimée.`);
        const itemToRemove = uiElements.sessionList.querySelector(`li[data-session-id="${id}"]`);
        if (itemToRemove) { itemToRemove.remove(); }
        if (uiElements.sessionList.children.length === 0 || uiElements.sessionList.querySelectorAll('li:not(.no-sessions):not(.loading-sessions)').length === 0) {
             uiElements.sessionList.innerHTML = '<li class="no-sessions">Aucune partie sauvegardée.</li>';
        }
        if (state.currentSessionId === Number(id)) {
            console.log("Session active supprimée. Réinitialisation.");
            handleResetToInitialState(state, uiElements); // Pass state
        }
    } else {
        alert(`Erreur lors de la suppression: ${result.error || 'Erreur inconnue'}`);
    }
    state.sessionIdToDelete = null; // Update state
}

/**
 * Resets the application state and UI to initial values.
 * @param {object} state - Reference to the global state object.
 * @param {object} uiElements - Reference to the UI elements object.
 */
export function handleResetToInitialState(state, uiElements) {
    console.log("Réinitialisation état et UI.");
    // Reset global state
    state.chatHistory = [];
    state.selectedTheme = null;
    state.selectedAgeGroup = null;
    state.selectedGender = null;
    state.selectedPlayerName = null;
    state.currentSessionId = null;
    state.selectedTurnCount = 15; // Reset to default
    state.totalTurnCount = 0;
    state.currentTurnNumber = 0;
    state.sessionIdToDelete = null;

    // Reset UI
    ui.resetUISelections(uiElements, state.selectedTurnCount);
    ui.resetChatAreaUI(uiElements);
    // Check controls based on the now reset state
    ui.checkAndEnableThemeControls({
        selectedAgeGroup: state.selectedAgeGroup,
        selectedGender: state.selectedGender,
        selectedPlayerName: state.selectedPlayerName
     }, uiElements);
    ui.updateTurnCounterDisplay(state.currentTurnNumber, state.totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
    ui.setActiveSessionIndicator(null, uiElements.sessionList);

    // --- MODIFICATIONS ---
    if (uiElements.appContainer) uiElements.appContainer.classList.remove('sidebar-hidden'); // Affiche la sidebar
    if (uiElements.sidebarToggle) uiElements.sidebarToggle.style.display = 'none'; // Cache le bouton toggle
    // --- FIN MODIFICATIONS ---

    // UI Visibility
    uiElements.themeSelectionDiv.style.display = 'flex';
    uiElements.chatAreaDiv.style.display = 'none';
    if (uiElements.mainTitleElement) { uiElements.mainTitleElement.textContent = "Aventure IA"; }

    // Disable chat inputs specifically
    ui.setInputDisabledState(true, uiElements); // Disable all chat inputs first
    // Re-enable non-chat inputs if needed (though usually done via checkAndEnableThemeControls)
    // Example: if theme selection buttons should be enabled:
    // uiElements.themeButtons.forEach(b => b.disabled = false); // But checkAndEnable handles this better

    // Ensure specific chat inputs are disabled
    if (uiElements.userInput) uiElements.userInput.disabled = true;
    if (uiElements.sendButton) uiElements.sendButton.disabled = true;
    if (uiElements.choiceButtons) uiElements.choiceButtons.forEach(b=>b.disabled=true);
    if (uiElements.continueButton) uiElements.continueButton.disabled=true;
    if (uiElements.inventoryButton) uiElements.inventoryButton.disabled=true;
    if (uiElements.loadingIndicator) uiElements.loadingIndicator.style.display = 'none';
}
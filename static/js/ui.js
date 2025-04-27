// static/js/ui.js

/**
 * Ajoute un message (utilisateur ou IA) au chatbox.
 * @param {string} message - Le contenu du message.
 * @param {'user' | 'ai'} sender - L'expéditeur ('user' ou 'ai').
 * @param {HTMLElement} chatboxElement - L'élément HTML du chatbox.
 * @param {string | null} playerName - Le nom du joueur (pour label 'user').
 */
export function addMessage(message, sender, chatboxElement, playerName) {
    if (!chatboxElement) return;

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');

    const senderLabel = document.createElement('span');
    senderLabel.classList.add('sender-label');

    if (sender === 'user') {
        messageElement.classList.add('user-message');
        senderLabel.textContent = playerName || 'Joueur/Joueuse'; // Utilise nom si dispo
    } else {
        messageElement.classList.add('ai-message');
        senderLabel.textContent = 'Narrateur IA';
    }
    messageElement.appendChild(senderLabel);

    const messageContent = document.createElement('span');
    // Sécurisation basique et formatage
    const safeMessage = message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Met en gras les choix A), B), C) en début de ligne
    const formattedMessage = safeMessage.replace(/^(<strong>)?([A-C]\))(\s*<\/strong>)?/gm, '<strong>$2</strong>');
    // Remplace les sauts de ligne par <br>
    messageContent.innerHTML = formattedMessage.replace(/\n/g, '<br>');
    messageElement.appendChild(messageContent);

    chatboxElement.appendChild(messageElement);
    // Scroll vers le bas après un court délai pour laisser le temps au rendu
    requestAnimationFrame(() => {
        chatboxElement.scrollTop = chatboxElement.scrollHeight;
    });
}

/**
 * Active ou désactive les contrôles de saisie du chat (input, boutons).
 * @param {boolean} disabled - true pour désactiver, false pour activer.
 * @param {object} elements - Un objet contenant les références aux éléments HTML.
 * @param {HTMLElement} elements.userInput - Champ de saisie utilisateur.
 * @param {HTMLElement} elements.sendButton - Bouton Envoyer.
 * @param {NodeListOf<HTMLElement>} elements.choiceButtons - Boutons de choix A/B/C.
 * @param {HTMLElement} elements.continueButton - Bouton Continuer.
 * @param {HTMLElement} elements.inventoryButton - Bouton Inventaire. // <-- Assurez-vous que cette référence est passée depuis script.js
 * @param {HTMLElement} elements.loadingIndicator - Indicateur de chargement.
 * @param {HTMLElement} elements.chatAreaDiv - Conteneur de la zone de chat.
 */
export function setInputDisabledState(disabled, elements) {
    if (elements.userInput) elements.userInput.disabled = disabled;
    if (elements.sendButton) elements.sendButton.disabled = disabled;
    if (elements.choiceButtons) elements.choiceButtons.forEach(b => b.disabled = disabled);
    if (elements.continueButton) elements.continueButton.disabled = disabled;
    // --- LIGNE MODIFIÉE/AJOUTÉE ---
    if (elements.inventoryButton) elements.inventoryButton.disabled = disabled; // <-- Gère maintenant le bouton Inventaire
    // --- FIN LIGNE MODIFIÉE/AJOUTÉE ---
    if (elements.loadingIndicator) elements.loadingIndicator.style.display = disabled ? 'block' : 'none';

    // Focus sur l'input seulement si le chat est visible et qu'on active les inputs
    if (!disabled && elements.chatAreaDiv && elements.chatAreaDiv.style.display !== 'none' && elements.userInput) {
        elements.userInput.focus();
    }
}

/**
 * Met à jour l'état (activé/désactivé) et la visibilité des contrôles de sélection de thème.
 * @param {object} state - L'état actuel des sélections.
 * @param {string | null} state.selectedAgeGroup
 * @param {string | null} state.selectedGender
 * @param {string | null} state.selectedPlayerName
 * @param {object} elements - Les éléments HTML concernés.
 * @param {HTMLElement} elements.nameInputContainer
 * @param {HTMLElement} elements.turnSelectionContainer
 * @param {HTMLElement} elements.themeChoiceHeader
 * @param {HTMLElement} elements.selectionSeparator
 * @param {NodeListOf<HTMLElement>} elements.themeButtons
 */
export function checkAndEnableThemeControls(state, elements) {
    const nameVisibleAndFilled = elements.nameInputContainer.style.display !== 'none' && state.selectedPlayerName && state.selectedPlayerName.trim() !== '';
    const prerequisitesMet = state.selectedAgeGroup && state.selectedGender && nameVisibleAndFilled;

    // Afficher/Masquer les sections dépendantes
    elements.turnSelectionContainer.style.display = prerequisitesMet ? 'block' : 'none';
    elements.themeChoiceHeader.style.display = prerequisitesMet ? 'block' : 'none';
    elements.selectionSeparator.style.display = prerequisitesMet ? 'block' : 'none';

    // Activer/Désactiver les boutons de thème
    elements.themeButtons.forEach(themeBtn => {
        if (prerequisitesMet) {
            themeBtn.style.pointerEvents = 'auto';
            themeBtn.style.opacity = '1';
            themeBtn.classList.remove('disabled');
        } else {
            themeBtn.style.pointerEvents = 'none';
            themeBtn.style.opacity = '0.6';
            themeBtn.classList.add('disabled');
        }
    });
}


/**
 * Met à jour le titre principal et la date de la session active dans la barre latérale.
 * @param {number | null} sessionId - L'ID de la session active.
 * @param {string | null} theme - Le thème de la session.
 * @param {string | null} playerName - Le nom du joueur.
 * @param {Date | string} timestamp - Le timestamp de la dernière activité.
 * @param {HTMLElement} mainTitleElement - L'élément H1 du titre principal.
 * @param {HTMLElement} sessionListElement - L'élément UL de la liste des sessions.
 * @param {Function} formatDateFn - La fonction pour formater la date (ex: utils.formatDisplayDate).
 */
export function updateUITimestampAndTitle(sessionId, theme, playerName, timestamp, mainTitleElement, sessionListElement, formatDateFn) {
    if (!sessionId) return;

    const formattedDate = formatDateFn(timestamp);

    // Mettre à jour le titre principal
    if (mainTitleElement && theme && playerName) {
        mainTitleElement.textContent = `${theme} - ${playerName} (Activité: ${formattedDate})`;
    }

    // Mettre à jour la date dans l'élément de liste actif
    const activeSessionItem = sessionListElement.querySelector(`li.active-session[data-session-id="${sessionId}"]`);
    if (activeSessionItem) {
        const dateSpan = activeSessionItem.querySelector('.session-date');
        if (dateSpan) {
            dateSpan.textContent = `Joué: ${formattedDate}`;
        }
    }
}

/**
 * Met en évidence la session active dans la liste de la barre latérale.
 * @param {number | null} activeSessionId - L'ID de la session à marquer comme active.
 * @param {HTMLElement} sessionListElement - L'élément UL de la liste des sessions.
 */
export function setActiveSessionIndicator(activeSessionId, sessionListElement) {
    const sessionItems = sessionListElement.querySelectorAll('li[data-session-id]');
    sessionItems.forEach(item => {
        // Comparer les nombres après conversion
        if (activeSessionId !== null && Number(item.dataset.sessionId) === Number(activeSessionId)) {
            item.classList.add('active-session');
        } else {
            item.classList.remove('active-session');
        }
    });
}

/**
 * Met à jour l'affichage du compteur de tours dans l'interface.
 * @param {number} currentTurn - Le numéro du tour actuel.
 * @param {number} totalTurns - Le nombre total de tours prévu.
 * @param {HTMLElement} displayContainer - L'élément conteneur du compteur.
 * @param {HTMLElement} counterSpan - L'élément SPAN qui affiche le texte.
 */
export function updateTurnCounterDisplay(currentTurn, totalTurns, displayContainer, counterSpan) {
    if (totalTurns > 0 && displayContainer && counterSpan) {
        // Assurer que currentTurn ne dépasse pas totalTurns pour l'affichage
        const displayTurn = Math.min(currentTurn, totalTurns);
        counterSpan.textContent = `Tour : ${displayTurn} / ${totalTurns}`;
        displayContainer.style.display = 'block'; // Afficher le compteur
    } else if (displayContainer) {
        displayContainer.style.display = 'none'; // Cacher si pas de total défini
    }
}

/**
 * Affiche le modal de confirmation de suppression.
 * @param {string} message - Le message à afficher dans le modal.
 * @param {HTMLElement | null} modalElement - L'élément modal.
 * @param {HTMLElement | null} messageElement - L'élément pour afficher le message.
 */
export function showDeleteModal(message, modalElement, messageElement) {
     if (messageElement) messageElement.textContent = message;
     if (modalElement) modalElement.classList.add('visible');
}

/**
 * Cache le modal de confirmation de suppression.
 * @param {HTMLElement | null} modalElement - L'élément modal.
 */
export function hideDeleteModal(modalElement) {
    if (modalElement) modalElement.classList.remove('visible');
}

/**
 * Réinitialise les sélections UI (âge, genre, nom, slider) à leur état initial.
 * @param {object} elements - Références aux éléments HTML concernés.
 * @param {NodeListOf<HTMLElement>} elements.ageButtons
 * @param {NodeListOf<HTMLElement>} elements.genderButtons
 * @param {HTMLElement} elements.playerNameInput
 * @param {HTMLElement} elements.genderSelectionContainer
 * @param {HTMLElement} elements.nameInputContainer
 * @param {HTMLElement} elements.turnSelectionContainer
 * @param {HTMLElement} elements.turnCountSlider
 * @param {HTMLElement} elements.turnCountValueSpan
 * @param {number} defaultTurnCount - La valeur par défaut du slider.
 */
export function resetUISelections(elements, defaultTurnCount) {
    elements.ageButtons.forEach(btn => btn.classList.remove('selected'));
    elements.genderButtons.forEach(btn => btn.classList.remove('selected'));
    if (elements.playerNameInput) elements.playerNameInput.value = '';
    if (elements.turnCountSlider) elements.turnCountSlider.value = defaultTurnCount;
    if (elements.turnCountValueSpan) elements.turnCountValueSpan.textContent = `${defaultTurnCount} tours`;

    // Masquer les sections dépendantes
    if (elements.genderSelectionContainer) elements.genderSelectionContainer.style.display = 'none';
    if (elements.nameInputContainer) elements.nameInputContainer.style.display = 'none';
    if (elements.turnSelectionContainer) elements.turnSelectionContainer.style.display = 'none';
}

/**
 * Réinitialise la zone de chat (vide le contenu, cache le compteur).
 * @param {object} elements - Références aux éléments HTML concernés.
 * @param {HTMLElement} elements.chatbox
 * @param {HTMLElement} elements.turnCounterDisplay
 */
export function resetChatAreaUI(elements) {
    if (elements.chatbox) elements.chatbox.innerHTML = '';
    if (elements.turnCounterDisplay) elements.turnCounterDisplay.style.display = 'none';
}

/**
 * Met à jour l'affichage de la liste des sessions.
 * @param {Array<object>} sessions - Le tableau des sessions reçues de l'API.
 * @param {HTMLElement} sessionListElement - L'élément UL de la liste.
 * @param {Function} formatDateFn - La fonction pour formater les dates.
 * @param {number|null} activeSessionId - L'ID de la session actuellement active.
 */
export function displaySessionList(sessions, sessionListElement, formatDateFn, activeSessionId) {
    sessionListElement.innerHTML = ''; // Vider la liste

    if (!sessions || sessions.length === 0) {
        sessionListElement.innerHTML = '<li class="no-sessions">Aucune partie sauvegardée.</li>';
    } else {
        sessions.forEach(session => {
            const li = document.createElement('li');
            li.dataset.sessionId = session.id;

            // Bouton Supprimer
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-session-btn';
            deleteBtn.innerHTML = '&times;'; // Icône croix
            deleteBtn.setAttribute('aria-label', 'Supprimer cette partie');
            deleteBtn.dataset.sessionId = session.id; // ID sur bouton aussi pour l'event listener
            li.appendChild(deleteBtn);

            // Infos Session
            const nameSpan = document.createElement('span');
            nameSpan.className = 'session-name';
            nameSpan.textContent = session.player_name || 'Inconnu';
            li.appendChild(nameSpan);

            const themeSpan = document.createElement('span');
            themeSpan.className = 'session-theme';
            themeSpan.textContent = session.theme || 'Thème inconnu';
            li.appendChild(themeSpan);

            const dateSpan = document.createElement('span');
            dateSpan.className = 'session-date';
            dateSpan.textContent = `Joué: ${formatDateFn(session.last_played)}`;
            li.appendChild(dateSpan);

            sessionListElement.appendChild(li);
        });
        // Marquer la session active APRES avoir ajouté tous les éléments
        setActiveSessionIndicator(activeSessionId, sessionListElement);
    }
} //
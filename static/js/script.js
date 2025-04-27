// static/js/script.js - Coordinateur Principal

// Importer les modules
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as api from './api.js';

// --- Références HTML (Conservées ici pour être passées aux modules UI) ---
const bodyElement = document.body; // Référence au body
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const themeSelectionDiv = document.getElementById('themeSelection');
const chatAreaDiv = document.getElementById('chatArea');
const newGameButton = document.getElementById('newGameButton');
const sessionList = document.getElementById('sessionList');
const ageSelectionContainer = themeSelectionDiv.querySelector('.age-selection');
const ageButtons = ageSelectionContainer.querySelectorAll('.age-selection button.toggle-button'); // Préciser sélecteur
const genderSelectionContainer = document.getElementById('gender-selection-container');
const genderButtons = genderSelectionContainer.querySelectorAll('#gender-selection-container button.toggle-button'); // Préciser sélecteur
const nameInputContainer = document.getElementById('name-input-container');
const playerNameInput = document.getElementById('playerNameInput');
const selectionSeparator = document.getElementById('selection-separator');
const turnSelectionContainer = document.getElementById('turn-selection-container');
const turnCountSlider = document.getElementById('turnCountSlider');
const turnCountValueSpan = document.getElementById('turnCountValue');
const themeChoiceHeader = document.getElementById('theme-choice-header');
const themeButtonsContainer = themeSelectionDiv.querySelector('.theme-buttons-container');
const themeButtons = themeButtonsContainer.querySelectorAll('button');
const chatbox = document.getElementById('chatbox');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const choiceButtonsContainer = document.getElementById('actionButtons');
const choiceButtons = choiceButtonsContainer.querySelectorAll('.choice-button');
const continueButton = document.getElementById('continueButton');
const mainTitleElement = document.getElementById('mainTitle');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const deleteConfirmMessage = document.getElementById('deleteConfirmMessage');
const turnCounterDisplay = document.getElementById('turn-counter-display');
const turnCounterSpan = document.getElementById('turn-counter');
const darkModeToggleButton = document.getElementById('darkModeToggle'); // AJOUT référence bouton

// Créer un objet pour passer facilement les références UI aux fonctions
const uiElements = {
    sidebar, mainContent, themeSelectionDiv, chatAreaDiv, newGameButton, sessionList,
    ageSelectionContainer, ageButtons, genderSelectionContainer, genderButtons, nameInputContainer,
    playerNameInput, selectionSeparator, turnSelectionContainer, turnCountSlider, turnCountValueSpan,
    themeChoiceHeader, themeButtonsContainer, themeButtons, chatbox, userInput, sendButton,
    loadingIndicator, choiceButtonsContainer, choiceButtons, continueButton, mainTitleElement,
    deleteConfirmModal, confirmDeleteBtn, cancelDeleteBtn, deleteConfirmMessage,
    turnCounterDisplay, turnCounterSpan,
    darkModeToggleButton // AJOUT bouton au pack
};

// --- Variables Globales d'État (Conservées ici) ---
let chatHistory = [];
let selectedTheme = null;
let selectedAgeGroup = null;
let selectedGender = null;
let selectedPlayerName = null;
let selectedTurnCount = 15; // Default value
let totalTurnCount = 0;
let currentTurnNumber = 0;
let currentSessionId = null;
let sessionIdToDelete = null;

// --- Fonctions Dark Mode ---

/** Applique le thème (clair ou sombre) à l'élément body */
function applyTheme(theme) {
    if (theme === 'dark') {
        bodyElement.classList.add('dark-mode');
    } else {
        bodyElement.classList.remove('dark-mode');
    }
    // Optionnel: Mettre à jour l'état du bouton toggle si visuellement différent
    // (Ici, le CSS gère l'affichage des icônes soleil/lune via la classe sur body)
}

/** Gère le clic sur le bouton de changement de thème */
function handleThemeToggle() {
    const isDarkMode = bodyElement.classList.contains('dark-mode');
    const newTheme = isDarkMode ? 'light' : 'dark';
    applyTheme(newTheme);
    // Sauvegarder la préférence
    try {
        localStorage.setItem('theme', newTheme);
        console.log(`Thème sauvegardé: ${newTheme}`);
    } catch (e) {
        console.warn("Impossible de sauvegarder le thème dans localStorage:", e);
    }
}

/** Charge le thème préféré au démarrage */
function loadPreferredTheme() {
    let preferredTheme = 'light'; // Défaut
    try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme && (savedTheme === 'light' || savedTheme === 'dark')) {
            preferredTheme = savedTheme;
            console.log(`Thème chargé depuis localStorage: ${preferredTheme}`);
        } else {
            // Si pas de thème sauvegardé, vérifier la préférence système
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                preferredTheme = 'dark';
                console.log("Thème préféré système détecté: dark");
            } else {
                 console.log("Utilisation du thème par défaut: light");
            }
        }
    } catch (e) {
        console.warn("Impossible de lire les préférences de thème depuis localStorage ou système:", e);
    }
    applyTheme(preferredTheme);
}


// --- Fonctions Principales de Coordination ---

async function handleSendMessage(messageContent, displayMessageOverride = null) {
    if (!currentSessionId) return; // Garder la garde ici

    const messageToSend = messageContent.trim();
    if (messageToSend === '') return;

    const messageToDisplay = displayMessageOverride || messageToSend;
    // Appel UI pour ajouter le message utilisateur
    ui.addMessage(messageToDisplay, 'user', uiElements.chatbox, selectedPlayerName);

    if (document.activeElement === uiElements.userInput || document.activeElement === uiElements.sendButton) {
        uiElements.userInput.value = '';
    }

    // Appel API pour envoyer le message
    const result = await api.sendMessage(messageToSend, chatHistory, currentSessionId, ui.addMessage, ui.setInputDisabledState, uiElements);

    if (result.success && result.data) {
        // Mettre à jour l'état local
        chatHistory = result.data.history;
        // La réponse IA est déjà ajoutée par api.sendMessage en cas de succès via addMessageFn
        ui.addMessage(result.data.reply, 'ai', uiElements.chatbox, null); // Ajout explicite ici (peut être redondant si api.js l'ajoute déjà)
        ui.updateUITimestampAndTitle(currentSessionId, selectedTheme, selectedPlayerName, new Date(), uiElements.mainTitleElement, uiElements.sessionList, utils.formatDisplayDate);
        currentTurnNumber++;
        ui.updateTurnCounterDisplay(currentTurnNumber, totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
    }
    // Les erreurs (réseau/serveur) sont gérées et affichées par api.sendMessage via addMessageFn
}


async function handleStartNewGame() {
    selectedTurnCount = parseInt(uiElements.turnCountSlider.value, 10);

    if (!selectedTheme || !selectedAgeGroup || !selectedGender || !selectedPlayerName || selectedPlayerName.trim() === '' || !selectedTurnCount) {
        alert("Erreur: Infos manquantes (Thème, Age, Genre, Nom, Durée).");
        return;
    }

    // Mettre à jour l'état
    totalTurnCount = selectedTurnCount;
    currentTurnNumber = 0;
    currentSessionId = null;
    chatHistory = [];

    // Mise à jour UI initiale
    const initialTime = new Date();
    if (uiElements.mainTitleElement) {
        uiElements.mainTitleElement.textContent = `${selectedTheme} - ${selectedPlayerName} (Activité: ${utils.formatDisplayDate(initialTime)})`;
    }
    uiElements.themeSelectionDiv.style.display = 'none';
    uiElements.chatAreaDiv.style.display = 'flex';
    uiElements.chatbox.innerHTML = ''; // Vider chat

    // Message initial UI
    ui.addMessage(`Lancement de l'aventure "${selectedTheme}" pour ${selectedPlayerName} (${selectedGender}, ${selectedAgeGroup}) (env. ${totalTurnCount} tours)...`, 'ai', uiElements.chatbox, null); //

    // Appel API pour démarrer
    const gameData = { theme: selectedTheme, ageGroup: selectedAgeGroup, gender: selectedGender, playerName: selectedPlayerName, turnCount: totalTurnCount };
    const result = await api.startNewGame(gameData, ui.addMessage, ui.setInputDisabledState, uiElements);

    if (result.success && result.data) {
        // Mise à jour état après succès API
        chatHistory = result.data.history;
        currentSessionId = result.data.session_id;
        // Ajout réponse IA à l'UI
        ui.addMessage(result.data.reply, 'ai', uiElements.chatbox, null); // Ajout explicite

        if (!currentSessionId) {
            console.error("ID de session non reçu après startNewGame.");
            ui.addMessage("Erreur: La sauvegarde initiale n'a pas pu être créée.", 'ai', uiElements.chatbox, null);
        } else {
            console.log(`Nouvelle partie démarrée. Session ID: ${currentSessionId}, Tours: ${totalTurnCount}`);
            await refreshSessionList(); // Recharger la liste
            currentTurnNumber = 1; // Premier tour après réponse IA
            ui.setActiveSessionIndicator(currentSessionId, uiElements.sessionList); // S'assurer qu'elle est active
            ui.updateTurnCounterDisplay(currentTurnNumber, totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
        }
    } else {
        // Erreur gérée dans api.startNewGame, on pourrait vouloir reset ici
        handleResetToInitialState(); // Revenir à l'état initial si le démarrage échoue
    }
     // Réactiver les inputs après la fin de l'opération (même si erreur)
    ui.setInputDisabledState(false, uiElements);
}

async function handleLoadGame(sessionId) {
     console.log(`Coordination chargement session ID: ${sessionId}`);
    ui.setInputDisabledState(true, uiElements);
    uiElements.chatbox.innerHTML = ''; // Vider avant le message de chargement
    ui.addMessage('Chargement de la partie...', 'ai', uiElements.chatbox, null); // Message UI
    uiElements.themeSelectionDiv.style.display = 'none';
    uiElements.chatAreaDiv.style.display = 'flex';
    currentTurnNumber = 0;
    totalTurnCount = 0;

    // Appel API
    const result = await api.loadGame(sessionId);

    if (result.success && result.data) {
        // Mettre à jour l'état local
        currentSessionId = result.data.id;
        selectedPlayerName = result.data.player_name;
        selectedTheme = result.data.theme;
        selectedAgeGroup = result.data.age_group;
        selectedGender = result.data.gender;
        chatHistory = result.data.history || [];
        totalTurnCount = result.data.initial_turn_count || 0; // Récupérer le total depuis la DB

        // Mise à jour UI
        ui.updateUITimestampAndTitle(currentSessionId, selectedTheme, selectedPlayerName, result.data.last_played, uiElements.mainTitleElement, uiElements.sessionList, utils.formatDisplayDate);
        uiElements.chatbox.innerHTML = ''; // Vider le message de chargement
        chatHistory.forEach(msg => ui.addMessage(msg.content, msg.role, uiElements.chatbox, selectedPlayerName));

        currentTurnNumber = chatHistory.filter(msg => msg.role === 'assistant').length;
        ui.updateTurnCounterDisplay(currentTurnNumber, totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan);
        ui.addMessage(`Reprise de "${selectedTheme}" pour ${selectedPlayerName}. (Tour ${currentTurnNumber}/${totalTurnCount||'? '})`, 'ai', uiElements.chatbox, null);
        ui.setActiveSessionIndicator(currentSessionId, uiElements.sessionList);
        console.log(`Session ${currentSessionId} chargée. Tour: ${currentTurnNumber}/${totalTurnCount}`);
    } else {
        // Erreur chargement
        console.error(`Erreur chargement ${sessionId}:`, result.error);
        uiElements.chatbox.innerHTML = ''; // Vider le message de chargement
        ui.addMessage(`Erreur chargement: ${result.error || 'Erreur inconnue'}.`, 'ai', uiElements.chatbox, null);
        handleResetToInitialState(); // Reset si chargement échoue
    }

    ui.setInputDisabledState(false, uiElements);
}


async function refreshSessionList() {
    // Message UI temporaire
    uiElements.sessionList.innerHTML = '<li class="loading-sessions">Chargement...</li>';
    // Appel API
    const result = await api.loadSessionList();

    if (result.success && result.data) {
        // Appel UI pour afficher la liste
        ui.displaySessionList(result.data, uiElements.sessionList, utils.formatDisplayDate, currentSessionId);
    } else {
        console.error("Erreur refreshSessionList:", result.error);
        uiElements.sessionList.innerHTML = `<li class="no-sessions">Erreur chargement (${result.error || 'inconnue'}).</li>`;
    }
}

async function handleDeleteSession() {
     if (!sessionIdToDelete) return;
    const id = sessionIdToDelete; // Copier avant reset potentiel
    console.log(`Coordination suppression session ID: ${id}`);
    ui.hideDeleteModal(uiElements.deleteConfirmModal); // Cacher UI

    // Appel API
    const result = await api.executeDeleteSession(id);

    if (result.success) {
        console.log(`Session ${id} supprimée.`);
        // Mise à jour UI (retirer de la liste)
        const itemToRemove = uiElements.sessionList.querySelector(`li[data-session-id="${id}"]`);
        if (itemToRemove) { itemToRemove.remove(); }
        // Vérifier si la liste est vide
        if (uiElements.sessionList.children.length === 0 || uiElements.sessionList.querySelectorAll('li:not(.no-sessions):not(.loading-sessions)').length === 0) {
             uiElements.sessionList.innerHTML = '<li class="no-sessions">Aucune partie sauvegardée.</li>';
        }
        // Si la session active a été supprimée, reset l'état et l'UI
        if (currentSessionId === Number(id)) {
            console.log("Session active supprimée. Réinitialisation.");
            handleResetToInitialState();
        }
    } else {
        // Erreur API
        alert(`Erreur lors de la suppression: ${result.error || 'Erreur inconnue'}`);
    }
    sessionIdToDelete = null; // Nettoyer l'état
}

function handleResetToInitialState() {
    console.log("Réinitialisation état et UI.");
    // Reset état global
    chatHistory = []; selectedTheme = null; selectedAgeGroup = null; selectedGender = null; selectedPlayerName = null; currentSessionId = null;
    selectedTurnCount = 15; totalTurnCount = 0; currentTurnNumber = 0;
    sessionIdToDelete = null;

    // Reset UI spécifique via ui.js
    ui.resetUISelections(uiElements, selectedTurnCount);
    ui.resetChatAreaUI(uiElements);
    ui.checkAndEnableThemeControls({ selectedAgeGroup, selectedGender, selectedPlayerName }, uiElements); // Met à jour l'état des boutons/slider
    ui.updateTurnCounterDisplay(currentTurnNumber, totalTurnCount, uiElements.turnCounterDisplay, uiElements.turnCounterSpan); // Cache compteur chat
    ui.setActiveSessionIndicator(null, uiElements.sessionList); // Désactive indicateur session

    // Reset affichage principal
    uiElements.themeSelectionDiv.style.display = 'flex';
    uiElements.chatAreaDiv.style.display = 'none';
    if (uiElements.mainTitleElement) { uiElements.mainTitleElement.textContent = "Aventure IA"; }

    // Gérer l'état disabled des inputs
    // Activer ceux de la sélection, désactiver ceux du chat
    ui.setInputDisabledState(false, uiElements); // Théoriquement réactive tout...
    // ...mais on désactive spécifiquement ceux du chat qui ne doivent pas l'être
    if (uiElements.userInput) uiElements.userInput.disabled = true;
    if (uiElements.sendButton) uiElements.sendButton.disabled = true;
    if (uiElements.choiceButtons) uiElements.choiceButtons.forEach(b=>b.disabled=true);
    if (uiElements.continueButton) uiElements.continueButton.disabled=true;
    if (uiElements.loadingIndicator) uiElements.loadingIndicator.style.display = 'none'; // Assurer que le spinner est caché
}


// --- Initialisation et Écouteurs d'Événements ---

function initEventListeners() {
    console.log("Initialisation des écouteurs d'événements...");

    // Bouton Nouvelle Partie
    if (uiElements.newGameButton) {
        uiElements.newGameButton.addEventListener('click', handleResetToInitialState);
    } else { console.warn("Élément manquant: newGameButton"); }

    // Liste des Sessions (délégation)
    if (uiElements.sessionList) {
        uiElements.sessionList.addEventListener('click', (event) => {
            const clickedDeleteBtn = event.target.closest('.delete-session-btn');
            const clickedLi = event.target.closest('li[data-session-id]');

            if (clickedDeleteBtn) {
                event.stopPropagation(); // Empêche le chargement
                sessionIdToDelete = clickedDeleteBtn.dataset.sessionId; // Stocker l'ID
                const nameSpan = clickedLi ? clickedLi.querySelector('.session-name') : null;
                const playerName = nameSpan ? nameSpan.textContent : `ID ${sessionIdToDelete}`;
                // Appel UI pour afficher le modal
                ui.showDeleteModal(
                    `Voulez-vous vraiment supprimer la partie de "${playerName}" (ID: ${sessionIdToDelete}) ? Cette action est irréversible.`,
                    uiElements.deleteConfirmModal,
                    uiElements.deleteConfirmMessage
                );
            } else if (clickedLi) {
                handleLoadGame(clickedLi.dataset.sessionId); // Charger la partie
            }
        });
    } else { console.warn("Élément manquant: sessionList"); }

    // Boutons du Modal de Suppression
    if (uiElements.confirmDeleteBtn) {
        uiElements.confirmDeleteBtn.addEventListener('click', handleDeleteSession);
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
            selectedAgeGroup = b.dataset.age;
            uiElements.ageButtons.forEach(btn => btn.classList.remove('selected'));
            b.classList.add('selected');
            if(uiElements.genderSelectionContainer) uiElements.genderSelectionContainer.style.display = 'block';
            ui.checkAndEnableThemeControls({ selectedAgeGroup, selectedGender, selectedPlayerName }, uiElements);
        }));
    } else { console.warn("Éléments manquants: ageButtons"); }

    if (uiElements.genderButtons) {
        uiElements.genderButtons.forEach(b => b.addEventListener('click', () => {
            selectedGender = b.dataset.gender;
            uiElements.genderButtons.forEach(btn => btn.classList.remove('selected'));
            b.classList.add('selected');
            if (uiElements.nameInputContainer) uiElements.nameInputContainer.style.display = 'block';
            if (uiElements.playerNameInput) uiElements.playerNameInput.focus();
            ui.checkAndEnableThemeControls({ selectedAgeGroup, selectedGender, selectedPlayerName }, uiElements);
        }));
    } else { console.warn("Éléments manquants: genderButtons"); }

    if (uiElements.playerNameInput) {
        uiElements.playerNameInput.addEventListener('input', () => {
             selectedPlayerName = uiElements.playerNameInput.value.trim();
             ui.checkAndEnableThemeControls({ selectedAgeGroup, selectedGender, selectedPlayerName }, uiElements);
         });
    } else { console.warn("Élément manquant: playerNameInput"); }

    if (uiElements.turnCountSlider) {
        uiElements.turnCountSlider.addEventListener('input', () => {
            selectedTurnCount = parseInt(uiElements.turnCountSlider.value, 10);
            if (uiElements.turnCountValueSpan) uiElements.turnCountValueSpan.textContent = `${selectedTurnCount} tours`;
            // Pas besoin d'appeler checkAndEnableThemeControls ici, car la condition ne change pas
        });
    } else { console.warn("Élément manquant: turnCountSlider"); }

    // Sélection Thème
    if (uiElements.themeButtonsContainer) {
        uiElements.themeButtonsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-theme]');
            if (btn && !btn.classList.contains('disabled') && btn.style.pointerEvents !== 'none') {
                // Vérifier l'état global avant de démarrer
                if (selectedAgeGroup && selectedGender && selectedPlayerName && selectedPlayerName.trim() !== '' && selectedTurnCount) {
                    selectedTheme = btn.dataset.theme;
                    handleStartNewGame(); // Appeler la fonction de coordination
                } else {
                    alert("Complétez Age, Genre, Nom et Durée avant de choisir un thème.");
                }
            }
        });
    } else { console.warn("Élément manquant: themeButtonsContainer"); }

    // Actions du Chat
    if (uiElements.sendButton) {
        uiElements.sendButton.addEventListener('click', () => {
             if (currentSessionId && uiElements.userInput.value) {
                 handleSendMessage(uiElements.userInput.value);
             }
         });
     } else { console.warn("Élément manquant: sendButton"); }

    if (uiElements.userInput) {
        uiElements.userInput.addEventListener('keypress', (e) => {
             if (e.key === 'Enter') {
                 e.preventDefault();
                 if (currentSessionId && uiElements.userInput.value) {
                    handleSendMessage(uiElements.userInput.value);
                 }
             }
         });
     } else { console.warn("Élément manquant: userInput"); }

    if (uiElements.choiceButtons) {
        uiElements.choiceButtons.forEach(b => b.addEventListener('click', () => {
            if (!currentSessionId) return;
            const letter = b.dataset.choice;
            // Utiliser l'utilitaire importé
            const text = utils.extractChoiceTextFromHistory(letter, chatHistory);
            const display = text ? `Choix ${letter}: "${text}"` : `Choix ${letter}`; // Rendre plus clair
            handleSendMessage(letter, display); // Envoyer la lettre, afficher le texte complet
        }));
    } else { console.warn("Éléments manquants: choiceButtons"); }

    if (uiElements.continueButton) {
        uiElements.continueButton.addEventListener('click', () => {
             if (!currentSessionId) return;
             handleSendMessage("Continuer");
         });
     } else { console.warn("Élément manquant: continueButton"); }

    // AJOUT : Écouteur pour le bouton Dark Mode
    if (uiElements.darkModeToggleButton) {
        uiElements.darkModeToggleButton.addEventListener('click', handleThemeToggle);
    } else { console.warn("Élément manquant: darkModeToggleButton"); }


    console.log("Écouteurs d'événements initialisés.");
}

// --- Initialisation au chargement du DOM ---
document.addEventListener('DOMContentLoaded', () => {
     console.log("DOM chargé. Initialisation de l'application...");
     loadPreferredTheme();      // Charger le thème AVANT le reste
     handleResetToInitialState(); // Assurer l'état initial propre
     initEventListeners();        // Attacher les écouteurs
     refreshSessionList();        // Charger les sessions initiales
     console.log("Aventure IA: Prête.");
     // Afficher la sélection au démarrage
     uiElements.themeSelectionDiv.style.display = 'flex';
     uiElements.chatAreaDiv.style.display = 'none';
});
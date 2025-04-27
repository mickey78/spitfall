// static/js/script.js - Point d'Entrée Principal

// Importer les modules requis
import * as utils from './utils.js';
import * as ui from './ui.js';
import * as api from './api.js';
import * as themeHandlers from './theme.js';
import * as gameHandlers from './handlers.js';
import { initEventListeners } from './event_listeners.js';

// --- Références HTML ---
// (Rassemblées ici pour être passées aux modules)
const appContainer = document.getElementById('app-container'); // <-- AJOUTÉ
const bodyElement = document.body;
const sidebar = document.getElementById('sidebar');
const mainContent = document.getElementById('main-content');
const themeSelectionDiv = document.getElementById('themeSelection');
const chatAreaDiv = document.getElementById('chatArea');
const newGameButton = document.getElementById('newGameButton');
const sessionList = document.getElementById('sessionList');
const ageSelectionContainer = themeSelectionDiv.querySelector('.age-selection');
const ageButtons = ageSelectionContainer.querySelectorAll('.age-selection button.toggle-button');
const genderSelectionContainer = document.getElementById('gender-selection-container');
const genderButtons = genderSelectionContainer.querySelectorAll('#gender-selection-container button.toggle-button');
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
const inventoryButton = document.getElementById('inventoryButton');
const mainTitleElement = document.getElementById('mainTitle');
const deleteConfirmModal = document.getElementById('deleteConfirmModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
const deleteConfirmMessage = document.getElementById('deleteConfirmMessage');
const turnCounterDisplay = document.getElementById('turn-counter-display');
const turnCounterSpan = document.getElementById('turn-counter');
const darkModeToggleButton = document.getElementById('darkModeToggle');
const sidebarToggle = document.getElementById('sidebarToggle'); // <-- AJOUTÉ

// Objet contenant les références UI
const uiElements = {
    appContainer, // <-- AJOUTÉ
    bodyElement, // Added body reference for theme module
    sidebar, mainContent, themeSelectionDiv, chatAreaDiv, newGameButton, sessionList,
    ageSelectionContainer, ageButtons, genderSelectionContainer, genderButtons, nameInputContainer,
    playerNameInput, selectionSeparator, turnSelectionContainer, turnCountSlider, turnCountValueSpan,
    themeChoiceHeader, themeButtonsContainer, themeButtons, chatbox, userInput, sendButton,
    loadingIndicator, choiceButtonsContainer, choiceButtons, continueButton, inventoryButton,
    mainTitleElement, deleteConfirmModal, confirmDeleteBtn, cancelDeleteBtn, deleteConfirmMessage,
    turnCounterDisplay, turnCounterSpan,
    darkModeToggleButton,
    sidebarToggle // <-- AJOUTÉ
};

// --- État Global de l'Application ---
// (Conservé ici pour être passé aux handlers et listeners)
const appState = {
    chatHistory: [],
    selectedTheme: null,
    selectedAgeGroup: null,
    selectedGender: null,
    selectedPlayerName: null,
    selectedTurnCount: 15, // Default value
    totalTurnCount: 0,
    currentTurnNumber: 0,
    currentSessionId: null,
    sessionIdToDelete: null,
};


// --- Initialisation au chargement du DOM ---
document.addEventListener('DOMContentLoaded', () => {
     console.log("DOM chargé. Initialisation de l'application...");

     // 1. Charger le thème préféré
     themeHandlers.loadPreferredTheme(uiElements.bodyElement);

     // 2. Réinitialiser l'état et l'UI
     gameHandlers.handleResetToInitialState(appState, uiElements);

     // 3. Initialiser les écouteurs d'événements (en passant l'état, les éléments UI et les handlers)
     initEventListeners(appState, uiElements, gameHandlers, themeHandlers);

     // 4. Charger la liste des sessions initiales
     gameHandlers.refreshSessionList(appState, uiElements);

     console.log("Aventure IA: Prête.");
     // Afficher la sélection au démarrage (géré dans handleResetToInitialState)
});
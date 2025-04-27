// static/js/api.js

// Note: Ce module dépendra de fonctions UI importées pour gérer les états disabled/loading et afficher les erreurs.

/**
 * Envoie un message au backend et gère la réponse.
 * @param {string} messageContent - Le message à envoyer.
 * @param {Array<object>} currentHistory - L'historique actuel du chat.
 * @param {number} sessionId - L'ID de la session en cours.
 * @param {Function} addMessageFn - Fonction pour ajouter un message à l'UI (importée de ui.js).
 * @param {Function} setInputDisabledFn - Fonction pour gérer l'état disabled (importée de ui.js).
 * @param {object} uiElements - Références aux éléments UI nécessaires pour setInputDisabledFn.
 * @returns {Promise<{success: boolean, data: object | null, error: string | null}>} - Résultat de l'opération.
 */
export async function sendMessage(messageContent, currentHistory, sessionId, addMessageFn, setInputDisabledFn, uiElements) {
    const messageToSend = messageContent.trim();
    if (messageToSend === '' || !sessionId) {
        return { success: false, data: null, error: "Message vide ou ID de session manquant." };
    }

    setInputDisabledFn(true, uiElements);

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: messageToSend,
                history: currentHistory,
                session_id: sessionId
            })
        });

        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData, error: null };
        } else {
            console.error('Erreur serveur (send):', response.status, responseData);
            addMessageFn(`Erreur ${response.status}: ${responseData.error || 'Problème serveur.'}`, 'ai', uiElements.chatbox, null);
            return { success: false, data: null, error: responseData.error || `Erreur serveur ${response.status}` };
        }
    } catch (error) {
        console.error('Erreur réseau (send):', error);
        addMessageFn("Erreur réseau lors de l'envoi du message.", 'ai', uiElements.chatbox, null);
        return { success: false, data: null, error: "Erreur réseau." };
    } finally {
        setInputDisabledFn(false, uiElements);
    }
}

/**
 * Démarre une nouvelle partie en appelant le backend.
 * @param {object} gameData - Données pour démarrer la partie.
 * @param {string} gameData.theme
 * @param {string} gameData.ageGroup
 * @param {string} gameData.gender
 * @param {string} gameData.playerName
 * @param {number} gameData.turnCount
 * @param {Function} addMessageFn - Fonction pour ajouter un message à l'UI.
 * @param {Function} setInputDisabledFn - Fonction pour gérer l'état disabled.
 * @param {object} uiElements - Références aux éléments UI.
 * @returns {Promise<{success: boolean, data: object | null, error: string | null}>} - Résultat.
 */
export async function startNewGame(gameData, addMessageFn, setInputDisabledFn, uiElements) {

    setInputDisabledFn(true, uiElements);

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                theme: gameData.theme,
                ageGroup: gameData.ageGroup,
                gender: gameData.gender,
                playerName: gameData.playerName,
                turnCount: gameData.turnCount,
                message: "Commence l'aventure.", // Message déclencheur
                history: [] // Historique vide pour le début
            })
        });

        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData, error: null };
        } else {
            console.error('Erreur serveur (startNewGame):', responseData);
            addMessageFn(`Erreur démarrage: ${responseData.error || `Erreur ${response.status}`}`, 'ai', uiElements.chatbox, gameData.playerName);
             return { success: false, data: null, error: responseData.error || `Erreur serveur ${response.status}` };
        }
    } catch (error) {
        console.error('Erreur réseau (startNewGame):', error);
        addMessageFn("Erreur réseau au démarrage de l'aventure.", 'ai', uiElements.chatbox, gameData.playerName);
        return { success: false, data: null, error: "Erreur réseau." };
    } finally {
        // Ne pas réactiver ici, car l'état sera géré par le coordinateur après la réponse IA
        // setInputDisabledFn(false, uiElements);
    }
}

/**
 * Charge les détails d'une session existante depuis le backend.
 * @param {number} sessionId - L'ID de la session à charger.
 * @returns {Promise<{success: boolean, data: object | null, error: string | null}>} - Résultat.
 */
export async function loadGame(sessionId) {
    try {
        const response = await fetch(`/sessions/${sessionId}`);
        const responseData = await response.json();

        if (response.ok) {
            return { success: true, data: responseData, error: null };
        } else {
            console.error(`Erreur chargement session ${sessionId}:`, responseData);
            return { success: false, data: null, error: responseData.error || `Session ${sessionId} introuvable ou erreur serveur.` };
        }
    } catch (error) {
        console.error('Erreur réseau (loadGame):', error);
        return { success: false, data: null, error: "Erreur réseau lors du chargement." };
    }
}

/**
 * Récupère la liste de toutes les sessions sauvegardées.
 * @returns {Promise<{success: boolean, data: Array<object> | null, error: string | null}>} - Résultat.
 */
export async function loadSessionList() {
    try {
        const response = await fetch('/sessions');
        if (response.ok) {
            const sessions = await response.json();
            return { success: true, data: sessions, error: null };
        } else {
            console.error("Erreur API récupération sessions:", response.status);
            return { success: false, data: null, error: `Erreur serveur ${response.status}` };
        }
    } catch (error) {
        console.error("Erreur réseau (loadSessionList):", error);
        return { success: false, data: null, error: "Erreur réseau." };
    }
}

/**
 * Supprime une session via l'API backend.
 * @param {number} sessionId - L'ID de la session à supprimer.
 * @returns {Promise<{success: boolean, error: string | null}>} - Résultat.
 */
export async function executeDeleteSession(sessionId) {
    try {
        const response = await fetch(`/sessions/${sessionId}`, { method: 'DELETE' });
        if (response.ok) {
            console.log(`Session ${sessionId} supprimée via API.`);
            return { success: true, error: null };
        } else {
            const errorData = await response.json().catch(() => ({ error: "Erreur suppression." }));
            console.error(`Erreur API suppression ${sessionId}:`, response.status, errorData);
            return { success: false, error: errorData.error || `Erreur ${response.statusText}` };
        }
    } catch (error) {
        console.error('Erreur réseau (delete):', error);
        return { success: false, error: "Erreur réseau lors de la suppression." };
    }
}
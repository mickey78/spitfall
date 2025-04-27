// static/js/utils.js

/**
 * Formate une date (chaîne ISO ou objet Date) en JJ/MM/AA HH:MM.
 * @param {string | Date} dateInput - La date à formater.
 * @returns {string} La date formatée ou "Date inconnue".
 */
export function formatDisplayDate(dateInput) {
    try {
        const date = new Date(dateInput);
        // Options pour forcer JJ/MM/AA et HH:MM (format 24h)
        const dateOptions = { year: '2-digit', month: '2-digit', day: '2-digit' };
        const timeOptions = { hour: '2-digit', minute: '2-digit', hour12: false };

        // Utiliser 'fr-CA' est souvent robuste pour YYYY-MM-DD, on va reconstruire
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');

        return `${day}/${month}/${year} ${hours}:${minutes}`;
    } catch (e) {
        console.error("Erreur formatage date:", dateInput, e);
        return "Date inconnue"; // Fallback
    }
}


/**
 * Extrait le texte complet d'un choix (A, B, C) à partir du dernier message de l'IA dans l'historique.
 * @param {string} choiceLetter - La lettre du choix ('A', 'B', ou 'C').
 * @param {Array<object>} chatHistory - L'historique de la conversation.
 * @returns {string | null} Le texte extrait ou null si non trouvé.
 */
export function extractChoiceTextFromHistory(choiceLetter, chatHistory) {
    if (!chatHistory || chatHistory.length === 0) return null;
    let lastAiMessageContent = null;
    // Parcourir l'historique à l'envers pour trouver le dernier message de l'assistant
    for (let i = chatHistory.length - 1; i >= 0; i--) {
        if (chatHistory[i].role === 'assistant') {
            lastAiMessageContent = chatHistory[i].content;
            break; // Arrêter dès qu'on trouve le dernier message IA
        }
    }
    if (!lastAiMessageContent) return null; // Pas de message IA trouvé

    // Regex pour trouver la ligne commençant par "A) ", "B) ", etc. (insensible à la casse, multiligne)
    // et capturer le texte qui suit jusqu'à la fin de la ligne.
    // Gère les espaces optionnels après la parenthèse.
    const regex = new RegExp(`^\\s*${choiceLetter}\\)\\s*(.*?)\\s*(?:\\n|$)`, 'im');
    const match = lastAiMessageContent.match(regex);

    // Retourner le texte capturé (groupe 1) s'il existe, sinon null.
    return (match && match[1]) ? match[1].trim() : null;
}
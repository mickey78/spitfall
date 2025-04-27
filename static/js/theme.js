// static/js/theme.js

/**
 * Applique le thème (clair ou sombre) à l'élément body.
 * @param {string} theme - 'light' or 'dark'.
 * @param {HTMLElement} bodyElement - The body element.
 */
export function applyTheme(theme, bodyElement) {
    if (theme === 'dark') {
        bodyElement.classList.add('dark-mode');
    } else {
        bodyElement.classList.remove('dark-mode');
    }
}

/**
 * Gère le clic sur le bouton de changement de thème.
 * @param {HTMLElement} bodyElement - The body element.
 */
export function handleThemeToggle(bodyElement) {
    const isDarkMode = bodyElement.classList.contains('dark-mode');
    const newTheme = isDarkMode ? 'light' : 'dark';
    applyTheme(newTheme, bodyElement);
    // Sauvegarder la préférence
    try {
        localStorage.setItem('theme', newTheme);
        console.log(`Thème sauvegardé: ${newTheme}`);
    } catch (e) {
        console.warn("Impossible de sauvegarder le thème dans localStorage:", e);
    }
}

/**
 * Charge le thème préféré au démarrage et l'applique.
 * @param {HTMLElement} bodyElement - The body element.
 */
export function loadPreferredTheme(bodyElement) {
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
    applyTheme(preferredTheme, bodyElement);
}
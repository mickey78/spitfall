**A very basic AI-powered text adventure game for the whole family.**

This project uses the Gemini API to generate interactive story elements.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-directory>
    ```

2.  **Install dependencies:**
    *(Add commands here if you have dependencies, e.g.,)*
    ```bash
    # Example for Python:
    # pip install -r requirements.txt

    # Example for Node.js:
    # npm install
    ```

3.  **Set up Environment Variables:**
    Create a file named `.env` in the root directory of the project and add your Gemini API key and the desired model:

    ```dotenv
    # .env
    GEMINI_API_KEY=your_personal_gemini_api_key
    GEMINI_MODEL="gemini-1.5-flash-latest"
    # Or use the specific preview model: "gemini-2.5-flash-preview-04-17"
    ```

    *Note: You can get a free Gemini API key from Google AI Studio.*

    **Important:** Add `.env` to your `.gitignore` file to avoid accidentally committing your API key.
    ```gitignore
    # .gitignore
    .env
    ```

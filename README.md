**A very basic AI-powered text adventure game for the whole family.**

This project uses the Gemini API to generate interactive story elements.

## Installation

1.  **Clone the repository:**
    ```bash
    git clone <your-repository-url>
    cd <your-repository-directory>
    ```

2.  **Install dependencies:**
    *(Make sure you have Python installed. Then, install Flask and the Google Generative AI library)*
    ```bash
    pip install Flask google-generativeai python-dotenv
    # Or if you have a requirements.txt:
    # pip install -r requirements.txt
    ```
    *(Note: Added common dependencies for Flask/Gemini)*

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
    venv/
    __pycache__/
    *.pyc
    ```
    *(Note: Added common Python gitignore entries)*

## Running the Game

1.  **Navigate to the project directory** in your terminal if you aren't already there.
2.  **Run the application:**
    ```bash
    python app.py
    ```
3.  Open your web browser and go to `http://127.0.0.1:5000` (or the address shown in the terminal).


## OR via Docker 

```bash
docker build -t spitfall-app .

docker run -p 5002:5002 \                                                                              
           -v "$(pwd):/app" \
           -e FLASK_DEBUG=1 \
           -e GEMINI_API_KEY="your_api-Key" \
           -e GEMINI_MODEL="gemini-2.0-flash" \
           --name spitfall-container-dev \
           spitfall-app
```
import * as vscode from 'vscode';

let activeErrorDecorations: vscode.DecorationOptions[] = [];
let decorationType: vscode.TextEditorDecorationType;

export function activate(context: vscode.ExtensionContext) {
    // Register the command
    let checkDisposable = vscode.commands.registerCommand('krissugramma.checkGrammar', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Get the selected text; if nothing is selected, use the whole document
        const selection = editor.selection;
        //current file type
        const fileType = editor.document.languageId;

        let text = editor.document.getText(selection.isEmpty ? undefined : selection);
        if (!text) {
            vscode.window.showInformationMessage('No text to check.');
            return;
        }

        if (editor.document.languageId === 'latex') {
            // Remove LaTeX commands (e.g. \command, \command{...}, \command*[...]{...}).
            text = text.replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?(?:\{[^}]*\})*/g, "");
            // Remove inline math: $...$
            text = text.replace(/\$[^$]+\$/g, "");
            // Remove display math: \[...\]
            text = text.replace(/\\\[[\s\S]*?\\\]/g, "");
        }

        // Format text: join each word with a plus sign.
        const formattedText = text.split(/\s+/).join('+');
        const url = `https://www.filosoft.ee/html_speller_et/html_spell.cgi?doc=${formattedText}&out=T&suggest=yes`;

        try {
            const response = await fetch(url, {
                headers: {
                    "Referer": "https://www.filosoft.ee/html_speller_et/"
                },
            });
            const html = await response.text();

            // Use regex to find words inside <span data-fs-suggest="..."> tags.
            const regex = /<span data-fs-suggest="[^"]+">([^<]+)<\/span>/g;
            let match;
            const wrongWords: string[] = [];
            while ((match = regex.exec(html)) !== null) {
                wrongWords.push(match[1]);
            }

            if (wrongWords.length === 0) {
                vscode.window.showInformationMessage('No grammatical issues found.');
                return;
            }

            // Create or update the decoration type (red translucent background).
            if (!decorationType) {
                decorationType = vscode.window.createTextEditorDecorationType({
                    backgroundColor: 'rgba(255,0,0,0.3)'
                });
            }

            activeErrorDecorations = [];
            const documentText = editor.document.getText();

            // For each wrong word, find its occurrences and create decoration ranges.
            wrongWords.forEach(word => {
                let startIndex = 0;
                while ((startIndex = documentText.indexOf(word, startIndex)) !== -1) {
                    const startPos = editor.document.positionAt(startIndex);
                    const endPos = editor.document.positionAt(startIndex + word.length);
                    activeErrorDecorations.push({
                        range: new vscode.Range(startPos, endPos),
                        hoverMessage: 'Possibly incorrect word'
                    });
                    startIndex += word.length;
                }
            });

            // Apply decorations.
            editor.setDecorations(decorationType, activeErrorDecorations);
            vscode.window.showInformationMessage(`Grammar check complete: Found ${wrongWords.length} mistake(s).`);
        } catch (error) {
            vscode.window.showErrorMessage('Error checking grammar: ' + error);
        }
    });

    let suggestionDisposable = vscode.commands.registerCommand('krissugramma.getSuggestions', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }
        let selection = editor.selection;
        let selectedText = editor.document.getText(selection).trim();
        // If no text is selected, get the word at the cursor.
        if (!selectedText) {
            const wordRange = editor.document.getWordRangeAtPosition(selection.start);
            if (wordRange) {
                selectedText = editor.document.getText(wordRange);
                // Update selection to the word range for replacement.
                selection = new vscode.Selection(wordRange.start, wordRange.end);
            } else {
                vscode.window.showInformationMessage('Please position the cursor on a word for suggestions.');
                return;
            }
        }
        // Construct the URL for the suggestion API.
        const url = `https://www.filosoft.ee/html_speller_et/suggest.cgi?word=${encodeURIComponent(selectedText)}`;
        try {
            const response = await fetch(url);
            const html = await response.text();

            const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
            if (!bodyMatch) {
                vscode.window.showInformationMessage('No suggestions available.');
                return;
            }
            let bodyContent = bodyMatch[1];
            // Split suggestions by <br> tags and remove any HTML tags.
            const suggestions = bodyContent
                .split(/<br\s*\/?>/)
                .map(s => s.replace(/<[^>]+>/g, '').trim())
                .filter(s => s.length > 0);

            suggestions.pop();

            if (suggestions.length === 0) {
                vscode.window.showInformationMessage('No suggestions found.');
                return;
            }

            // Show suggestions in a quick pick menu.
            const selectedSuggestion = await vscode.window.showQuickPick(suggestions, {
                placeHolder: `Suggestions for "${selectedText}"`,
            });
            if (selectedSuggestion) {
                // Replace the selected word with the chosen suggestion.
                editor.edit(editBuilder => {
                    editBuilder.replace(selection, selectedSuggestion);
                });
            }
        } catch (error) {
            vscode.window.showErrorMessage('Error fetching suggestions: ' + error);
        }
    });

    // Listen to text document changes to remove decorations as the user edits.
    vscode.workspace.onDidChangeTextDocument(e => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || e.document !== editor.document || !decorationType) {
            return;
        }

        // For each change, filter out decorations that intersect with the changed range.
        e.contentChanges.forEach(change => {
            activeErrorDecorations = activeErrorDecorations.filter(dec => {
                // Check if the changed range intersects the decoration's range.
                // If it does, remove that decoration.
                return !dec.range.intersection(change.range);
            });
        });
        // Update the decorations.
        editor.setDecorations(decorationType, activeErrorDecorations);
    });

    context.subscriptions.push(suggestionDisposable);
    context.subscriptions.push(checkDisposable);
}

export function deactivate() { }

import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // Register the command
    let disposable = vscode.commands.registerCommand('extension.checkGrammar', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showErrorMessage('No active editor found.');
            return;
        }

        // Get the selected text; if nothing is selected, use the whole document
        const selection = editor.selection;
        const text = editor.document.getText(selection.isEmpty ? undefined : selection);
        if (!text) {
            vscode.window.showInformationMessage('No text to check.');
            return;
        }

        // Format text: join each word with a plus sign.
        const formattedText = text.split(/\s+/).join('+');
        const url = `https://www.filosoft.ee/html_speller_et/html_spell.cgi?doc=${formattedText}&out=T&suggest=yes`;

        try {
			const response = await fetch(url,{
				headers: {
					"Referer":"https://www.filosoft.ee/html_speller_et/"
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

            // Create a text editor decoration type (e.g., red background highlight).
            const decorationType = vscode.window.createTextEditorDecorationType({
                backgroundColor: 'rgba(255,0,0,0.3)'
            });

            const decorationsArray: vscode.DecorationOptions[] = [];
            const documentText = editor.document.getText();

            // For each wrong word, find its occurrences in the document and create decoration ranges.
            wrongWords.forEach(word => {
                let startIndex = 0;
                while ((startIndex = documentText.indexOf(word, startIndex)) !== -1) {
                    const startPos = editor.document.positionAt(startIndex);
                    const endPos = editor.document.positionAt(startIndex + word.length);
                    decorationsArray.push({
                        range: new vscode.Range(startPos, endPos),
                        hoverMessage: 'Possibly incorrect word'
                    });
                    startIndex += word.length;
                }
            });

            // Apply decorations to the editor.
            editor.setDecorations(decorationType, decorationsArray);
            vscode.window.showInformationMessage(`Grammar check complete: Found ${wrongWords.length} mistake(s).`);
        } catch (error) {
            vscode.window.showErrorMessage('Error checking grammar: ' + error);
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {}

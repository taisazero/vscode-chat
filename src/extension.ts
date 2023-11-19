import * as vscode from 'vscode';
// const { ChatVectorDBQAChain } = require("langchain/chains");
// const { HNSWLib } = require("langchain/vectorstores");
// const { OpenAIEmbeddings } = require("langchain/embeddings");
const { RecursiveCharacterTextSplitter } = require("langchain/text_splitter");
import { LLMChain } from "langchain/chains";
import {
  ChatPromptTemplate,
  SystemMessagePromptTemplate,
  HumanMessagePromptTemplate,
} from "langchain/prompts";
import { ChatOpenAI } from "langchain/chat_models/openai";

export async function activate(context: vscode.ExtensionContext) {
	// Only allow a single VSCode Chat panel at a time
	let currentPanel: vscode.WebviewPanel | undefined = undefined;
	let chain: any;
	

	const configuration = vscode.workspace.getConfiguration('');
	const API_KEY = configuration.get("rumi.OPENAI_KEY", "<API_KEY>");


	if (API_KEY === "<API_KEY>") {
		vscode.window.showErrorMessage("Please set OPENAI_KEY in the configuration");
		return;
	}
	/* Split the text into chunks */
	const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000 });
	const model = new ChatOpenAI({ openAIApiKey: API_KEY, temperature: 0, modelName:"gpt-4" });
	// const embedder = new OpenAIEmbeddings({ openAIApiKey: API_KEY})



	// Get the active text editor
	const editor = vscode.window.activeTextEditor;
	// get terminal output
	const terminal = vscode.window.createTerminal("Rumi");
	let terminalOutput = "";
	terminal.show();
	// run active python file if active file is python and record output
	if (editor) {
		if (editor.document.languageId === "python") {
			// save terminal output into a variable
			terminalOutput = terminal.sendText("python " + editor.document.fileName);
		}
	}


	if (editor) {
		let document = editor.document;

		// Get the document text
		const documentText = document.getText();
		const docs = textSplitter.createDocuments([documentText]);
		const steering = "You are a tutor that always responds in the Socratic style. You *never* give the student the answer, but always try to ask just the right question to help them learn to think for themselves. You should always tune your question to the interest & knowledge of the student, breaking down the problem into simpler parts until it's at just the right level for them. Socratic utterances are utterances that guide the user and do not give them the solution directly.";
		
		let humanTemplate = "From now on you will be talking to a student. The user is a student.\n\n## Buggy Code\n\n ```py\n{documentText}\n```\n\n## Code Output\n\n```{terminalOutput}\n```\n\n\n## Conversation so far\n\n{msg}\n\nRespond to the user with a Socratic utterance that guides the user to discover and fix the bug or issue in their code. The user's buggy code is described in `## Buggy Code`. User code is written in markdown throughout the conversation. Assume that the user has run the test cases.";
		humanTemplate = humanTemplate.replace("{documentText}", documentText);
		humanTemplate = humanTemplate.replace("{terminalOutput}", terminalOutput);
		
		const systemMessagePrompt = SystemMessagePromptTemplate.fromTemplate(steering);
		const humanMessagePrompt = HumanMessagePromptTemplate.fromTemplate(humanTemplate);

		const chatPrompt = ChatPromptTemplate.fromMessages([
		systemMessagePrompt,
		humanMessagePrompt,
		]);

		chain = new LLMChain({
			llm: model,
			prompt: chatPrompt,
			// memory: Sim
		});


		// const vectorStore = await HNSWLib.fromDocuments(docs, embedder);
		// chain = ChatVectorDBQAChain.fromLLM(model, vectorStore);
	}

	let disposable = vscode.commands.registerCommand('rumi.chat', async () => {
		if (currentPanel) {
			currentPanel.reveal(vscode.ViewColumn.One);
		} else {
			currentPanel = vscode.window.createWebviewPanel(
				'Rumi',
				'Rumi',
				vscode.ViewColumn.Two,
				{
					enableScripts: true
				}
			);
			currentPanel.webview.html = getWebviewContent(currentPanel.webview, context);
			currentPanel.onDidDispose(
				() => {
					currentPanel = undefined;
				},
				undefined,
				context.subscriptions
			);
			// Handle messages from the webview
			currentPanel.webview.onDidReceiveMessage(
				async message =>  {
					const msg = message.text; // "What does this file do?";
					const res = await chain.call({msg: msg});

					if (currentPanel) {
						currentPanel.webview.postMessage({ text: res["text"] });
					}
					return;
				},
				undefined,
				context.subscriptions
			  );
		}
	});

	context.subscriptions.push(disposable);
}

function getWebviewContent(webview: vscode.Webview, context: vscode.ExtensionContext) {
	// Get the local path to main script run in the webview, then convert it to a uri we can use in the webview.
	const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'chat.js'));
	const styleMainUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'style.css'));
	return `<!DOCTYPE html>
	<html>
	<head>
		<meta charset="UTF-8">
		<title>VSCode Chat</title>
		<link href="${styleMainUri}" rel="stylesheet">
	</head>
	<body>
		<div id="chat-container"></div>
		<input id="chat-input" type="text" placeholder="Type your message here..." onkeydown="if (event.keyCode == 13) document.getElementById('send-button').click()">
		<button id="send-button">Send</button>

		<script src="${scriptUri}"></script>
	</body>
	</html>`;
}


// Make a function that starts a debugging session, runs the active file, and tracks all variables passed in as arguments to this function
function runDebugger (varsToTrack: string[]) {
	// start debugging session
	vscode.debug.startDebugging(undefined, {
		name: "Rumi",
		type: "python",
		request: "launch",
		program: "${file}",
		console: "integratedTerminal",
	});
	for (let i = 0; i < varsToTrack.length; i++) {
		// add variable to watch
		vscode.debug.addWatchExpression(varsToTrack[i]);
	}
	// store variable values and then return a dictionary of variable names a list of their values throughout the debugging session
	let variableValues = {};
	vscode.debug.onDidChangeState((e) => {
		if (e == "stopped") {
			for (let i = 0; i < varsToTrack.length; i++) {
				// get variable value
				let variableValue = vscode.debug.activeDebugSession.customRequest("evaluate", {expression: varsToTrack[i]});
				// add variable value to dictionary
				variableValues[varsToTrack[i]] = variableValue;
			}
		}
	}
	);
	return variableValues;
}


// This method is called when your extension is deactivated
export function deactivate() {}
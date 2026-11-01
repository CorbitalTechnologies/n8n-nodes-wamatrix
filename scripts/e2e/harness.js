// Shared plumbing for the E2E scripts: a throwaway n8n user folder with this package
// linked in as a custom node, plus helpers to run n8n CLI commands against it.
const { execFile, spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const packageDir = path.resolve(__dirname, '..', '..');
const n8nBin = process.env.N8N_BIN || 'n8n';

function createHarness(extraEnv = {}) {
	const userFolder = fs.mkdtempSync(path.join(os.tmpdir(), 'wamatrix-n8n-e2e-'));
	const modules = path.join(userFolder, '.n8n', 'custom', 'node_modules');
	fs.mkdirSync(modules, { recursive: true });
	fs.symlinkSync(packageDir, path.join(modules, 'n8n-nodes-wamatrix'), 'junction');

	const env = {
		...process.env,
		N8N_USER_FOLDER: userFolder,
		N8N_DIAGNOSTICS_ENABLED: 'false',
		N8N_RUNNERS_ENABLED: 'false',
		...extraEnv,
	};
	const options = {
		encoding: 'utf8',
		shell: process.platform === 'win32',
		env,
		maxBuffer: 64 * 1024 * 1024,
	};

	const writeJson = (file, content) => {
		const target = path.join(userFolder, file);
		fs.writeFileSync(target, JSON.stringify(content));
		return target;
	};

	// Async on purpose: the mock API lives in this process and must keep answering while n8n runs.
	const run = (args) =>
		new Promise((resolve, reject) => {
			execFile(n8nBin, args, options, (error, stdout, stderr) =>
				error
					? reject(new Error([error.message, stdout, stderr].join('\n')))
					: resolve(`${stdout}\n${stderr}`),
			);
		});

	const importCredential = (port, token) =>
		run([
			'import:credentials',
			`--input=${writeJson('credentials.json', [
				{
					id: 'e2e-cred',
					name: 'WaMatrix mock',
					type: 'waMatrixApi',
					data: { apiToken: token, baseUrl: `http://127.0.0.1:${port}`, webhookSecret: '' },
				},
			])}`,
		]);

	const importWorkflow = (workflow) =>
		run(['import:workflow', `--input=${writeJson('workflow.json', workflow)}`]);

	// Starts `n8n start` and resolves once its HTTP server answers.
	const startServer = async (port) => {
		const child = spawn(n8nBin, ['start'], { ...options, env: { ...env, N8N_PORT: String(port) } });
		let log = '';
		child.stdout.on('data', (chunk) => (log += chunk));
		child.stderr.on('data', (chunk) => (log += chunk));

		for (let attempt = 0; attempt < 120; attempt++) {
			try {
				const response = await fetch(`http://127.0.0.1:${port}/healthz`);
				if (response.ok) {
					return {
						log: () => log,
						stop: () =>
							new Promise((resolve) => {
								child.once('exit', resolve);
								if (process.platform === 'win32') {
									spawn('taskkill', ['/pid', String(child.pid), '/T', '/F']);
								} else {
									child.kill('SIGTERM');
								}
							}),
					};
				}
			} catch {
				// not up yet
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}
		throw new Error(`n8n did not start:\n${log}`);
	};

	return { userFolder, run, importCredential, importWorkflow, startServer };
}

const credential = { waMatrixApi: { id: 'e2e-cred', name: 'WaMatrix mock' } };

module.exports = { createHarness, credential };

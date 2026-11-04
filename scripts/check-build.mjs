// Avant `firebase deploy` (predeploy de firebase.json) : l'outil de lecture des sauvegardes doit être dans le build,
// sinon Hosting le remplacerait par une 404. Un script plutôt que `node -e` : pas de guillemets propres à chaque shell.
import { existsSync } from 'node:fs';

const tool = 'build/stash-dechiffrer.html';
if (!existsSync(tool)) {
	console.error(`${tool} absent : lancer « npm run build » avant de déployer.`);
	process.exit(1);
}

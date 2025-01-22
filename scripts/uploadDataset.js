import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Initialisiere die OpenAI-Instanz mit Timeout
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // API-Schlüssel aus Umgebungsvariable
    timeout: 60000, // Timeout auf 60 Sekunden gesetzt
});

// Konfigurationsvariablen
const vectorStoreId = 'vs_aISnXuyx3qVySKPH11bU7D0y'; // Neue Vector Store ID
const githubRepoUrl = 'https://github.com/Grabbe-Gymnasium-Detmold/grabbe-ai-dataset/tree/main/sheets';
const tempFolder = './temp_sheets'; // Temporäres Verzeichnis zum Speichern der heruntergeladenen Dateien

(async () => {
    const actionsLog = []; // Array zum Protokollieren der Schritte

    try {
        console.log('🚀 Starting dataset upload process...');

        // Schritt 1: Bestehende Dateien aus dem Vector Store entfernen
        console.log('🗑️ Removing existing files from Vector Store...');
        const listResponse = await openai.beta.vectorStores.files.list(vectorStoreId);
        for (const file of listResponse.data) {
            await openai.beta.vectorStores.files.del(vectorStoreId, file.id);
            actionsLog.push({ action: 'delete', fileId: file.id, status: 'success' });
        }
        console.log('✅ Existing files removed.');

        // Schritt 2: Dateien aus GitHub herunterladen
        console.log('⬇️ Downloading files from GitHub...');
        const apiUrl = githubRepoUrl
            .replace('github.com', 'api.github.com/repos')
            .replace('/tree/main', '/contents');

        const githubResponse = await axios.get(apiUrl);
        const files = githubResponse.data;

        if (!fs.existsSync(tempFolder)) fs.mkdirSync(tempFolder);

        for (const file of files) {
            if (file.type === 'file') {
                const fileResponse = await axios.get(file.download_url, { responseType: 'arraybuffer' });
                const filePath = path.join(tempFolder, file.name);
                fs.writeFileSync(filePath, fileResponse.data);
                actionsLog.push({ action: 'download', fileName: file.name, status: 'success' });
                console.log(`📁 Downloaded: ${file.name}`);
            }
        }
        console.log('✅ Files downloaded from GitHub.');

        // Schritt 3: Neue Dateien in den Vector Store hochladen
        console.log('⬆️ Uploading files to Vector Store...');
        const uploadedFiles = [];

        for (const filename of fs.readdirSync(tempFolder)) {
            const filePath = path.join(tempFolder, filename);
            const fileStream = fs.createReadStream(filePath);

            // Wartezeit für Rate Limit
            await new Promise((resolve) => setTimeout(resolve, 1000)); // 1 Sekunde warten

            // Datei zu OpenAI hochladen
            const fileResponse = await openai.files.create({
                file: fileStream,
                purpose: 'assistants',
            });

            const fileId = fileResponse.id;
            uploadedFiles.push(fileId);

            // Datei mit dem Vector Store verknüpfen
            await openai.beta.vectorStores.files.create(
                vectorStoreId,
                {
                    file_id: fileId,
                    chunking_strategy: {
                        type: 'static',
                        static: {
                            max_chunk_size_tokens: 165,
                            chunk_overlap_tokens: 25,
                        },
                    },
                }
            );

            actionsLog.push({ action: 'upload', fileName: filename, fileId, status: 'success' });
            console.log(`📤 Uploaded: ${filename}`);
        }
        console.log('✅ Files uploaded to Vector Store.');

        // Schritt 4: Temporäre Dateien löschen
        console.log('🧹 Cleaning up temporary files...');
        fs.rmSync(tempFolder, { recursive: true, force: true });
        actionsLog.push({ action: 'cleanup', folder: tempFolder, status: 'success' });
        console.log('✅ Temporary files cleaned up.');

        // Erfolgreiche Rückgabe
        console.log('🎉 Dataset upload process completed successfully!');
        console.log(JSON.stringify({ status: 'success', actionsLog }, null, 2));
        process.exit(0); // Erfolg
    } catch (error) {
        console.error('❌ Error during dataset upload process:', error.message);
        console.error(error.stack);

        // Fehlerhafte Rückgabe mit Fehlerdetails
        console.log(JSON.stringify({
            status: 'error',
            message: error.message,
            stack: error.stack,
        }, null, 2));
        process.exit(1); // Fehler
    }
})();

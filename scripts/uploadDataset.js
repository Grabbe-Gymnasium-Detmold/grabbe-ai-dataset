import OpenAI from 'openai';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

// Initialisiere die OpenAI-Instanz
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // API-Schlüssel aus Umgebungsvariable
});

// Konfigurationsvariablen
const vectorStoreId = 'vs_aISnXuyx3qVySKPH11bU7D0y'; // Vector Store ID
const githubRepoUrl = 'https://github.com/Grabbe-Gymnasium-Detmold/grabbe-ai-dataset/tree/main/sheets';
const tempFolder = './temp_sheets'; // Temporäres Verzeichnis zum Speichern der heruntergeladenen Dateien

(async () => {
    const actionsLog = []; // Array zum Protokollieren der Schritte

    try {
        console.log('🚀 Starte den Upload-Prozess des Datasets...');

        // Schritt 1: Bestehende Dateien aus dem Vector Store entfernen
        console.log('🗑️ Entferne vorhandene Dateien aus dem Vector Store...');
        const listResponse = await openai.vectorStores.files.list(vectorStoreId);

        if (!listResponse || !Array.isArray(listResponse.data)) {
            throw new Error(`Unerwartete API-Antwortstruktur: ${JSON.stringify(listResponse)}`);
        }

        for (const file of listResponse.data) {
            await openai.vectorStores.files.del(vectorStoreId, file.id);
            actionsLog.push({ action: 'delete', fileId: file.id, status: 'success' });
        }
        console.log('✅ Vorhandene Dateien entfernt.');

        // Schritt 2: Dateien aus GitHub herunterladen
        console.log('⬇️ Lade Dateien von GitHub herunter...');
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
                console.log(`📁 Heruntergeladen: ${file.name}`);
            }
        }
        console.log('✅ Dateien von GitHub heruntergeladen.');

        // Schritt 3: Dateien einzeln hochladen
        console.log('⬆️ Lade Dateien in den Vector Store hoch...');
        for (const filename of fs.readdirSync(tempFolder)) {
            try {
                const filePath = path.join(tempFolder, filename);
                const fileStream = fs.createReadStream(filePath);

                // Datei zu OpenAI hochladen
                console.log(`🔄 Lade hoch: ${filename}`);
                const fileResponse = await openai.files.create({
                    file: fileStream,
                    purpose: 'assistants',
                });

                const fileId = fileResponse.id;

                // Datei mit dem Vector Store verknüpfen
                await openai.vectorStores.files.create(vectorStoreId, {
                    file_id: fileId,
                    chunking_strategy: {
                        type: 'static',
                        static: {
                            max_chunk_size_tokens: 165,
                            chunk_overlap_tokens: 25,
                        },
                    },
                });

                actionsLog.push({ action: 'upload', fileName: filename, fileId, status: 'success' });
                console.log(`✅ Hochgeladen: ${filename}`);
            } catch (error) {
                console.error(`❌ Fehler beim Hochladen von ${filename}:`, error.message);
                actionsLog.push({ action: 'upload', fileName: filename, status: 'error', message: error.message });
            }
        }
        console.log('✅ Alle Dateien verarbeitet.');

        // Schritt 4: Temporäre Dateien löschen
        console.log('🧹 Bereinige temporäre Dateien...');
        fs.rmSync(tempFolder, { recursive: true, force: true });
        actionsLog.push({ action: 'cleanup', folder: tempFolder, status: 'success' });
        console.log('✅ Temporäre Dateien bereinigt.');

        // Erfolgreiche Rückgabe
        console.log('🎉 Upload-Prozess des Datasets erfolgreich abgeschlossen!');
        console.log(JSON.stringify({ status: 'success', actionsLog }, null, 2));
        process.exit(0); // Erfolg
    } catch (error) {
        console.error('❌ Fehler während des Upload-Prozesses des Datasets:', error.message);
        console.error('Details:', error.response ? error.response.data : error.stack);

        // Fehlerhafte Rückgabe mit Fehlerdetails
        console.log(JSON.stringify({
            status: 'error',
            message: error.message,
            stack: error.stack,
        }, null, 2));
        process.exit(1); // Fehler
    }
})();
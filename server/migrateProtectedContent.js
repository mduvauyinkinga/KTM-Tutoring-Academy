const { initFirebaseAdmin } = require('./firebaseAdmin');

const CONTENT_COLLECTIONS = [
  { collection: 'lessons', storagePath: 'lessons' },
  { collection: 'past_papers', storagePath: 'papers' }
];

async function main() {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    throw new Error('Set FIREBASE_STORAGE_BUCKET to the configured Firebase Storage bucket.');
  }

  const admin = initFirebaseAdmin();
  const db = admin.firestore();
  const bucket = admin.storage().bucket(bucketName);
  const apply = process.argv.includes('--apply');
  const firestoreUpdates = [];
  const objectUpdates = [];
  const processedObjects = new Set();
  const unresolved = [];
  let objectsFound = 0;
  let downloadTokensRemoved = 0;

  for (const contentCollection of CONTENT_COLLECTIONS) {
    const snapshot = await db.collection(contentCollection.collection).get();
    for (const contentDoc of snapshot.docs) {
      const { fileName, isFree } = contentDoc.data();
      if (typeof fileName !== 'string' || !fileName || fileName.includes('/')) {
        unresolved.push(`${contentCollection.collection}/${contentDoc.id}`);
        continue;
      }

      const file = bucket.file(`${contentCollection.storagePath}/${fileName}`);
      if (processedObjects.has(file.name)) {
        unresolved.push(`${contentCollection.collection}/${contentDoc.id} (duplicate storage reference)`);
        continue;
      }
      processedObjects.add(file.name);
      try {
        const [objectMetadata] = await file.getMetadata();
        objectsFound += 1;
        const customMetadata = { ...(objectMetadata.metadata || {}) };
        const hadDownloadToken = Boolean(customMetadata.firebaseStorageDownloadTokens);
        delete customMetadata.firebaseStorageDownloadTokens;
        customMetadata.isFree = String(isFree === true);

        if (hadDownloadToken) downloadTokensRemoved += 1;
        objectUpdates.push({ file, customMetadata });
        firestoreUpdates.push(contentDoc.ref);
      } catch (error) {
        console.error(
          `[Content migration] Could not inspect ${contentCollection.storagePath}/${fileName}:`,
          error.message
        );
        unresolved.push(`${contentCollection.collection}/${contentDoc.id}`);
      }
    }
  }

  for (const prefix of ['lessons/', 'papers/']) {
    const [files] = await bucket.getFiles({ prefix });
    for (const file of files) {
      if (processedObjects.has(file.name)) continue;
      processedObjects.add(file.name);
      try {
        const [objectMetadata] = await file.getMetadata();
        objectsFound += 1;
        const customMetadata = { ...(objectMetadata.metadata || {}) };
        const hadDownloadToken = Boolean(customMetadata.firebaseStorageDownloadTokens);
        delete customMetadata.firebaseStorageDownloadTokens;
        customMetadata.isFree = 'false';
        if (hadDownloadToken) downloadTokensRemoved += 1;
        objectUpdates.push({ file, customMetadata });
      } catch (error) {
        console.error(`[Content migration] Could not inspect ${file.name}:`, error.message);
        unresolved.push(file.name);
      }
    }
  }

  console.log(`Content records with matching storage objects: ${objectsFound}`);
  console.log(`Download-token URLs to revoke: ${downloadTokensRemoved}`);
  console.log(`Content records requiring manual review: ${unresolved.length}`);

  if (unresolved.length) {
    console.error(`Content records requiring review: ${unresolved.join(', ')}`);
    console.error('No changes were applied. Resolve every record and run the migration again.');
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to protect objects and remove Firestore fileURL fields.');
  } else {
    for (const { file, customMetadata } of objectUpdates) {
      await file.setMetadata({
        metadata: {
          ...customMetadata,
          firebaseStorageDownloadTokens: null
        }
      });
    }

    for (let offset = 0; offset < firestoreUpdates.length; offset += 400) {
      const batch = db.batch();
      for (const contentRef of firestoreUpdates.slice(offset, offset + 400)) {
        batch.set(contentRef, {
          fileURL: admin.firestore.FieldValue.delete()
        }, { merge: true });
      }
      await batch.commit();
    }
    console.log(`Removed stored download URLs from ${firestoreUpdates.length} content records.`);
  }
}

main().catch((error) => {
  console.error('Protected content migration failed:', error);
  process.exitCode = 1;
});

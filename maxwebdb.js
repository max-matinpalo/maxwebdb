// Main entry point: Normalizes config, inspects existing schema, and handles upgrades.
export async function setupDb(config = {}) {

	// 1. Normalize configuration once for consistent reuse.
	const name = config.name;
	const stores = (config.stores || []).map(s => ({
		name: s.name,
		indexes: (s.indexes || []).map(normalizeIndex)
	}));

	// 2. Initial open (Version 1 if new, applies schema in upgradeneeded).
	const initialDb = await openRequest(name, null, stores);
	const version = initialDb.version;
	let needsUpgrade = false;

	// 3. Safety: If no stores are requested, we are done.
	if (!stores.length) return buildApi(initialDb, stores);

	// 4. Inspection: Check if existing DB matches requested schema exactly.
	if (initialDb.objectStoreNames.length !== stores.length) {
		needsUpgrade = true;
	} else {
		const tx = initialDb.transaction(Array.from(initialDb.objectStoreNames), "readonly");
		for (const s of stores) {
			if (!initialDb.objectStoreNames.contains(s.name)) {
				needsUpgrade = true;
				break;
			}
			const store = tx.objectStore(s.name);
			if (store.indexNames.length !== s.indexes.length) {
				needsUpgrade = true;
				break;
			}
			for (const idx of s.indexes) {
				if (!store.indexNames.contains(idx.name)) {
					needsUpgrade = true;
					break;
				}
			}
			if (needsUpgrade) break;
		}
	}

	if (!needsUpgrade) return buildApi(initialDb, stores);

	// 5. Schema mismatch: Close current connection and reopen with version bump.
	initialDb.close();
	const finalDb = await openRequest(name, version + 1, stores);
	return buildApi(finalDb, stores);
}

function normalizeIndex(index) {
	const isArray = Array.isArray(index);
	return {
		keyPath: isArray ? index : [index],
		idbKeyPath: index,
		name: isArray ? index.join("_") : index
	};
}

// Shared logic used during onupgradeneeded to create/delete stores/indexes.
function applySchema(dbInst, tx, stores) {

	// 1. Delete removed stores.
	const storeNames = Array.from(stores, s => s.name);
	for (const oldName of Array.from(dbInst.objectStoreNames)) {
		if (!storeNames.includes(oldName)) dbInst.deleteObjectStore(oldName);
	}

	for (const s of stores) {
		// 2. Create missing stores.
		const hasStore = dbInst.objectStoreNames.contains(s.name);
		const store = hasStore ? tx.objectStore(s.name) :
			dbInst.createObjectStore(s.name, { keyPath: "id", autoIncrement: true });

		// 3. Delete removed indexes.
		const indexNames = Array.from(s.indexes, idx => idx.name);
		for (const oldIdx of Array.from(store.indexNames)) {
			if (!indexNames.includes(oldIdx)) store.deleteIndex(oldIdx);
		}

		// 4. Create missing indexes.
		for (const idx of s.indexes) {
			if (!store.indexNames.contains(idx.name)) store.createIndex(idx.name, idx.idbKeyPath);
		}
	}
}

// Wraps IDBOpenDBRequest in a Promise and handles tab-blocking/versioning.
function openRequest(name, version, stores) {
	return new Promise((resolve, reject) => {
		const req = version ? indexedDB.open(name, version) : indexedDB.open(name);

		req.onblocked = () => console.warn("Database blocked by another tab");
		req.onupgradeneeded = () => applySchema(req.result, req.transaction, stores);
		req.onsuccess = () => {
			const dbInst = req.result;
			dbInst.onversionchange = () => dbInst.close();
			resolve(dbInst);
		};
		req.onerror = () => reject(req.error);
	});
}

// Maps the normalized store definitions to the final user-facing API.
function buildApi(dbInst, stores) {
	const api = {};
	for (const s of stores) {
		api[s.name] = {
			insert: (item) => runOp(dbInst, s.name, store => store.add(item)),
			put: (item) => runOp(dbInst, s.name, store => store.put(item)),
			delete: (key) => runOp(dbInst, s.name, store => store.delete(key)),
			clear: () => runOp(dbInst, s.name, store => store.clear()),
			findOne: (q, cb) => executeQuery(dbInst, s, q, cb, true),
			findMany: (q, cb) => executeQuery(dbInst, s, q, cb, false)
		};
	}
	api.clear = () => Promise.all(stores.map(s => api[s.name].clear()));

	api.log = async () => {

		// 1. Fetch data from all stores. 
		const results = await Promise.all(stores.map(s => runOp(dbInst, s.name, st => st.getAll())));

		// 2. Build and log tree
		const tree = {};
		stores.forEach((s, i) => tree[s.name] = results[i]);
		console.log(tree);
		return tree;
	};

	return api;
}

// Helper for write operations. Resolves on tx.oncomplete for data persistence.
function runOp(dbInst, storeName, op) {
	return new Promise((resolve, reject) => {
		const tx = dbInst.transaction(storeName, "readwrite");
		const store = tx.objectStore(storeName);
		let res;

		tx.oncomplete = () => resolve(res);
		tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
		tx.onerror = () => reject(tx.error || new Error("Transaction failed"));

		try {
			const req = op(store);
			req.onsuccess = () => res = req.result;
			req.onerror = () => reject(req.error);
		} catch (err) {
			reject(err);
		}
	});
}

// Handles complex querying: Index selection -> cursor scan -> JS filtering.
function executeQuery(dbInst, storeCfg, queryObj, queryCb, isOne) {
	return new Promise((resolve, reject) => {

		// 1. Initialize transaction and parameters.
		const tx = dbInst.transaction(storeCfg.name, "readonly");
		const store = tx.objectStore(storeCfg.name);
		const qObj = queryObj || {};
		const qKeys = Object.keys(qObj);

		// 2. Select index: Full composite match first, then single field index.
		let best = storeCfg.indexes
			.filter(idx => idx.keyPath.length > 1 && idx.keyPath.every(k => qKeys.includes(k)))
			.sort((a, b) => b.keyPath.length - a.keyPath.length)[0];

		const isSingle = idx => idx.keyPath.length === 1 && qKeys.includes(idx.keyPath[0]);
		if (!best) best = storeCfg.indexes.find(isSingle);

		// 3. Setup source. Fallback to full scan if IDBKeyRange throws.
		let source = store;
		let range = null;
		if (best) {
			try {
				const vals = best.keyPath.map(k => qObj[k]);
				const isArrayKey = Array.isArray(best.idbKeyPath);
				range = IDBKeyRange.only(isArrayKey ? vals : vals[0]);
				source = store.index(best.name);
			} catch (e) {
				range = null;
				source = store;
			}
		}

		tx.onabort = () => reject(tx.error || new Error("Query aborted"));
		tx.onerror = () => reject(tx.error || new Error("Query failed"));

		// 4. Cursor iteration with internal try/catch for safe queryCallback execution.
		const req = source.openCursor(range);
		const items = [];
		req.onerror = () => reject(req.error);
		req.onsuccess = () => {
			try {
				const cursor = req.result;
				if (!cursor) return resolve(isOne ? null : items);

				const val = cursor.value;
				let match = qKeys.every(k => val[k] === qObj[k]);
				if (match && queryCb) match = queryCb(val);

				if (match) {
					if (isOne) return resolve(val);
					items.push(val);
				}
				cursor.continue();
			} catch (err) {
				reject(err);
			}
		};
	});
}
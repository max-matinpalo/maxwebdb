// @ts-nocheck

import { createDb } from "./maxwebdb.js";

let isRunning = false;

export async function test() {
	if (isRunning) return;
	isRunning = true;

	try {
		// 1. Initialize test database
		let db = await setupDb();
		await seedData(db);

		// 2. Run query and operation tests
		await testSingleKeyIndex(db);
		await testMultiKeyIndex(db);
		await testIndexScan(db);
		await testCustomCallback(db);
		await testEdgeCases(db);
		await testNastyPaths(db);
		await testOtherOperations(db);

		// 3. Test schema upgrades, data survival, deletions, and global methods
		await testDataSurvivalDuringUpgrade();
		await testSchemaUpgradeAndGlobalClear();
		await testSchemaDeletion();

		// 4. Test concurrent connection logic
		await testConcurrentUpgrades();

		console.log("All tests passed successfully!");
	} catch (err) {
		console.error("Test sequence halted on error:", err);
	} finally {
		isRunning = false;
	}
}

async function setupDb() {
	// 1. Create DB with our specific indexes
	const db = await createDb({
		name: "TestDB",
		stores: [{
			name: "users",
			indexes: ["email", ["firstName", "lastName"]]
		}]
	});

	// 2. Ensure a clean state before seeding
	await db.users.clear();
	return db;
}

async function seedData(db) {
	// 1. Insert varied test data
	await db.users.insert({
		firstName: "John", lastName: "Doe", email: "john@test.com", age: 30
	});
	await db.users.insert({
		firstName: "Jane", lastName: "Doe", email: "jane@test.com", age: 25
	});
	await db.users.insert({
		firstName: "Bob", lastName: "Smith", email: "bob@test.com", age: 30
	});
	console.log("Database seeded");
}

async function testSingleKeyIndex(db) {
	// 1. Query exact index
	const user = await db.users.findOne({ email: "jane@test.com" });
	if (!user || user.firstName !== "Jane") throw new Error("Single key index failed");
	console.log("testSingleKeyIndex passed");
}

async function testMultiKeyIndex(db) {
	// 1. Query compound index
	const user = await db.users.findOne({ firstName: "John", lastName: "Doe" });
	if (!user || user.email !== "john@test.com") throw new Error("Multi key index failed");
	console.log("testMultiKeyIndex passed");
}

async function testIndexScan(db) {
	// 1. Query part of compound index
	const doeFamily = await db.users.findMany({ lastName: "Doe" });
	if (doeFamily.length !== 2) throw new Error("Index scan failed for lastName");

	// 2. Query unindexed field
	const ageGroup = await db.users.findMany({ age: 30 });
	if (ageGroup.length !== 2) throw new Error("Index scan failed for age");

	// 3. Query with mixed indexed and non-indexed fields
	const mixed = await db.users.findMany({ lastName: "Doe", age: 25 });
	if (mixed.length !== 1 || mixed[0].firstName !== "Jane") {
		throw new Error("Mixed query failed");
	}

	console.log("testIndexScan passed");
}

async function testCustomCallback(db) {
	// 1. Test custom JS filtering using findMany
	const olderUsers = await db.users.findMany({}, val => val.age > 26);
	if (olderUsers.length !== 2) throw new Error("Custom callback failed for findMany");

	// 2. Test custom JS filtering using findOne
	const match = val => val.firstName === "Jane" && val.age === 25;
	const specificUser = await db.users.findOne({}, match);
	if (!specificUser) throw new Error("Custom callback failed for findOne");

	console.log("testCustomCallback passed");
}

async function testEdgeCases(db) {
	// 1. findOne with no match should return null
	const ghost = await db.users.findOne({ email: "ghost@test.com" });
	if (ghost !== null) throw new Error("findOne should return null for no match");

	// 2. findMany with no match should return empty array
	const ghosts = await db.users.findMany({ age: 99 });
	if (!Array.isArray(ghosts) || ghosts.length !== 0) {
		throw new Error("findMany should return empty array");
	}

	// 3. insert with duplicate ID should fail (store.add constraint)
	let insertFailed = false;
	try {
		const existing = await db.users.findOne({ email: "jane@test.com" });
		await db.users.insert({ id: existing.id, email: "clone@test.com" });
	} catch (err) {
		insertFailed = true;
	}
	if (!insertFailed) throw new Error("insert should fail on duplicate ID");

	console.log("testEdgeCases passed");
}

async function testNastyPaths(db) {
	// 1. Callback throws should reject the promise
	let findOneRejected = false;
	try {
		await db.users.findOne({}, () => { throw new Error("Boom"); });
	} catch (err) {
		findOneRejected = true;
	}
	if (!findOneRejected) throw new Error("findOne callback throw did not reject");

	let findManyRejected = false;
	try {
		await db.users.findMany({}, () => { throw new Error("Boom"); });
	} catch (err) {
		findManyRejected = true;
	}
	if (!findManyRejected) throw new Error("findMany callback throw did not reject");

	// 2. Delete missing ID (IDB resolves successfully regardless)
	await db.users.delete(9999);

	// 3. Put on missing ID (Acts as an insert since autoIncrement is true)
	const ghostId = await db.users.put({ id: 8888, firstName: "Ghost", email: "g@test.com" });
	const ghost = await db.users.findOne({ id: ghostId });
	if (!ghost || ghost.firstName !== "Ghost") throw new Error("put on missing ID failed");

	// 4. findMany({}) should return all records
	const allUsers = await db.users.findMany({});
	if (allUsers.length !== 4) throw new Error("findMany({}) did not return all records");

	console.log("testNastyPaths passed");
}

async function testOtherOperations(db) {
	// 1. Verify put
	const user = await db.users.findOne({ email: "john@test.com" });
	user.firstName = "Johnny";
	await db.users.put(user);

	const updated = await db.users.findOne({ id: user.id });
	if (updated.firstName !== "Johnny") throw new Error("put failed: record not updated");

	// 2. Verify delete
	await db.users.delete(user.id);
	const deleted = await db.users.findOne({ id: user.id });
	if (deleted) throw new Error("delete failed: record still exists");

	// 3. Verify clear (This leaves the DB empty for the next tests!)
	await db.users.clear();
	const remaining = await db.users.findMany({});
	if (remaining.length !== 0) throw new Error("clear failed: store not empty");

	console.log("testOtherOperations passed");
}

async function testDataSurvivalDuringUpgrade() {
	const dbName = "DataSurvivalDB";

	// 1. Create V1 database and insert data
	const dbV1 = await createDb({
		name: dbName,
		stores: [{ name: "items", indexes: ["category"] }]
	});

	await dbV1.items.clear();
	const oldId = await dbV1.items.insert({ category: "A", val: 42 });

	// 2. Request V2 database (adds new index and new store)
	// V1 will auto-close due to the onversionchange handler
	const dbV2 = await createDb({
		name: dbName,
		stores: [
			{ name: "items", indexes: ["category", "val"] },
			{ name: "other", indexes: [] }
		]
	});

	// 3. Verify the V1 data survived the upgrade
	const oldItem = await dbV2.items.findOne({ id: oldId });
	if (!oldItem || oldItem.val !== 42) {
		throw new Error("Data survival failed: old data lost during upgrade");
	}

	// 4. Verify the newly created index can immediately query the old V1 data
	const queriedOldItem = await dbV2.items.findOne({ val: 42 });
	if (!queriedOldItem || queriedOldItem.id !== oldId) {
		throw new Error("Data survival failed: new index cannot find old data");
	}

	// 5. Cleanup
	await dbV2.clear();
	console.log("testDataSurvivalDuringUpgrade passed");
}

async function testSchemaUpgradeAndGlobalClear() {
	// 1. Re-initialize DB with a new store and a new index on the old store
	const dbV2 = await createDb({
		name: "TestDB",
		stores: [
			{
				name: "users",
				indexes: ["email", ["firstName", "lastName"], "age"]
			},
			{
				name: "settings",
				indexes: ["theme"]
			}
		]
	});

	// 2. Seed data into multiple stores
	await seedData(dbV2);
	await dbV2.settings.insert({ theme: "dark" });

	// 3. Verify new store works
	const settings = await dbV2.settings.findMany({});
	if (settings.length !== 1) throw new Error("Schema upgrade failed: new store unusable");

	// 4. Verify new index works on old store
	const thirtyYearOlds = await dbV2.users.findMany({ age: 30 });
	if (thirtyYearOlds.length !== 2) throw new Error("Schema upgrade failed: new index unusable");

	// 5. Test global parallel clear API
	await dbV2.clear();
	const remainingUsers = await dbV2.users.findMany({});
	const remainingSettings = await dbV2.settings.findMany({});
	if (remainingUsers.length > 0 || remainingSettings.length > 0) {
		throw new Error("Global clear failed to empty all stores");
	}

	console.log("testSchemaUpgradeAndGlobalClear passed");
}

async function testSchemaDeletion() {
	// 1. Re-initialize DB and remove the 'settings' store and the 'age' index
	const dbV3 = await createDb({
		name: "TestDB",
		stores: [{
			name: "users",
			indexes: ["email", ["firstName", "lastName"]]
		}]
	});

	// 2. Verify 'settings' API is completely gone
	if (dbV3.settings) throw new Error("Schema deletion failed: removed store still in API");

	// 3. Verify the underlying object store was actually deleted
	let storeDeleted = false;
	try {
		const rawReq = indexedDB.open("TestDB");
		await new Promise((resolve, reject) => {
			rawReq.onsuccess = (e) => {
				const idb = e.target.result;
				if (!idb.objectStoreNames.contains("settings")) storeDeleted = true;
				idb.close();
				resolve();
			};
			rawReq.onerror = reject;
		});
	} catch (err) {
		console.error("Raw DB check failed", err);
	}

	if (!storeDeleted) throw new Error("Schema deletion failed: store not deleted from IDB");

	console.log("testSchemaDeletion passed");
}

async function testConcurrentUpgrades() {
	// 1. Open Connection A and keep it alive
	const dbConnectionA = await createDb({
		name: "ConcurrentTestDB",
		stores: [{ name: "temp", indexes: [] }]
	});

	// 2. Request a schema upgrade via Connection B
	const upgradePromise = createDb({
		name: "ConcurrentTestDB",
		stores: [{ name: "temp", indexes: [] }, { name: "temp2", indexes: [] }]
	});

	// 3. Ensure Connection B resolves, proving Connection A auto-closed successfully
	const timeoutPromise = new Promise((_, reject) => {
		setTimeout(() => reject(new Error("Concurrent upgrade blocked by old connection")), 1000);
	});

	const dbConnectionB = await Promise.race([upgradePromise, timeoutPromise]);

	// 4. Cleanup
	await dbConnectionB.clear();

	console.log("testConcurrentUpgrades passed");
}

test();
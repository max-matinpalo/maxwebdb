import { setupDb } from "./maxwebdb.js";

async function runDatabaseDemo() {
	// 1. Config: Initialize database with stores and optional indexes.
	const db = await setupDb({
		name: "AppStorage",
		stores: [
			{ name: "tasks", indexes: ["status", ["priority", "dueDate"]] }
		]
	});

	// 2. Create: Add a new record. Returns the auto-generated "id".
	const taskId = await db.tasks.insert({
		title: "Initial Setup",
		status: "pending",
		priority: 1
	});

	// 3. Read: Fetch a single record using a query object.
	const task = await db.tasks.findOne({ title: "Initial Setup" });

	// 4. Update: Modify an existing record. The object must contain the "id".
	if (task) await db.tasks.put({ ...task, status: "completed" });

	// 5. Delete: Remove the record using its primary key.
	await db.tasks.delete(taskId);
}
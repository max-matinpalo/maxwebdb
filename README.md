# MAXWEBDB
A simple API for the IndexedDB.

- **Promises:** async/await for all CRUD operations.
- **Easy Queries:** Auto-selects the best index for performance.
- **Auto-Migrations:** Automatically handles database upgrades and schema changes.
- **Zero dependencies:** Single file, native performance.


```JS
await db.users.insert();
await db.products.findMany({query});
await db.example.remove();
...
```

## Quick start
``` bash
npm install maxwebdb
```

```js
import { createDb } from "maxwebdb";

const db = await createDb({
  name: "db1",
  stores: [
    { name: "users", indexes: ["email", "role"] },
    { name: "products", indexes: ["category", ["category", "status"]] }
  ]
});

const id = await db.users.insert({
  name: "peter",
  email: "peter@example.com",
  role: "admin"
});

const user = await db.users.findOne({ email: "peter@example.com" });
```


## Insert
```JS
const insertedId = await DB.exampleStore.insert({});
```
- maps to IndexedDb objectStore.add()
- if id in object not defined, it generates one

## Put
Inserts or replaces a record.
```JS
const insertedId = await DB.exampleStore.put({});
```
- maps to `objectStore.add()`
- If `id` is not provided, IndexedDB auto-generates it

## Delete
```JS
await DB.exampleStore.delete(key)
```
- Maps to `objectStore.delete()`

## Clear
```JS
await DB.exampleStore.clear()
```
- maps to IndexedDB objectStore.clear()

## Find

```JS
const item = await DB.exampleStore.findOne(queryObject, queryCb); 
const items = await DB.exampleStore.findMany(queryObject, queryCb);
```
**findOne** returns first record or null if not found  
**findMany** return array

#### queryObject
For strict equality checks. Auto uses indexes single field or compound indexed.
```js
{ category: "books", status: "active", authorId: 7 }
```
#### queryCallback
Optional callback for additional filtering.
Callback is called which each item which passed the query object check.
If callback returns true, item is included.

#### queryExecution
1. Check for matching composite indexes whose fields are all present in queryObject
	If multiple match, use the one with the most fields
2. If no composite index matches, try find first single-field index.
3. If no index matches, perform a full scan
4. Any remaining conditions are filtered in JavaScript.


### Store defintion
```js
{
  name: "posts",
  indexes: [
    "authorId",
    ["authorId", "status"]
  ]
}
```
For all stores: {keypath: id, autoincrement: true}. 
These options are fixed, to make things simple and because indexed DB can not migrate safely changes of these values.

#### Indexes
- A string creates a single-field index.
- An array creates a compound index.
- Options fixed to the default of indexedDb {unique: false, multiEntry false}
- We could add option to pass options object for indexes

## Schema sync behavior
On startup, `createDb()` compares the requested schema with the existing database and upgrades it when needed.

It can:
- Create missing stores
- Delete stores that were removed from config
- Create missing indexes
- Delete indexes that were removed from config
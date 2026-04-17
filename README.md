# MAXWEBDB
A simple API for the indexedDB.

- async/await CRUD operations
- simple performant queries
- zero dependencies, single file
- native performance

```JS
await db.users.insert({})
await db.products.findMany({x: 1, y: 2})

...
```

## SETUP
```JS
import { createDb } from "maxwebdb";

const DB = await createDb({
  name: "DB1",
  stores: [
    {name: "users"},
	{name: "products", indexes: ["category"]}
	...
  ]
});
```

- Call **createDb()** once at application start and pass desired config.
- It connects the database, inspect existing stores/indexes and computes changes.
- Applies all missing stores/indexes inside single upgrade transaction.


## 1. INSERT
```JS
const insertedId = await DB.exampleStore.insert({});
```
- maps to IndexedDb objectStore.add()
- if id in object not defined, it generates one

## 2. PUT
```JS
const insertedId = await DB.exampleStore.put({});
```
- maps to IndexedDB objectStore.put()

## 3. DELETE
```JS
await DB.exampleStore.delete(key)
```
- maps to IndexedDB objectStore.delete()


## 4. FIND

```JS
const item = await DB.exampleStore.findOne(queryObject, queryCb); 
const items = await DB.exampleStore.findMany(queryObject, queryCb);
```

### QUERY OBJECT
For strict equality checks. Auto uses indexes single field or compound indexed.

### QUERY CALLBACK
Optional callback for additional filtering.
Callback is called which each item which passed the query object check.
If callback returns true, item is included.

**findOne** returns first record or null if not found
**findMany** return array


#### QUERY EXECUTION
Example query: { a, b, c }
1. Check for matching composite indexes whose fields are all present in queryObject
	If multiple match, use the one with the most fields
2. If no composite index matches, try find first single-field index
	Example: a, b, or c
3. If no index matches, perform a full scan
4. Any remaining conditions are filtered in JavaScript.


### CLEAR
```JS
await DB.exampleStore.clear()
```
- maps to IndexedDB objectStore.clear()


### KEYSTORES
- For all stores: keypath: id, autoincrement: true, 
Fixed, because indexed DB can not migrate safely changes of these values

## INDEXES
- Options fixed to the default of indexedDb {unique: false, multiEntry false}
- We could add option to pass options object for indexes




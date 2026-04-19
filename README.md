<div align="center">
	<img src="assets/maxwebdb-logo.png" alt="Logo" width="200" height="200">
</div>

# maxwebdb
A simpler API for the IndexedDB.

- **Promises:** async/await for all CRUD operations.
- **Easy Queries:** Auto-selects the best index for performance.
- **Auto-Migrations:** Automatically handles database upgrades and schema changes.
- **Zero dependencies:** Single file, native performance, gziped about 1kb.


```JS
await db.users.insert();
await db.products.findMany({query});
await db.example.delete();
...
```

## Install
``` bash
npm install maxwebdb
```

## Setup
```js
import { setupDb } from "maxwebdb";

const config = {
  name: "db1",
  stores: [
    { name: "users", indexes: ["email", "role"] },
    { name: "products", indexes: ["category", ["category", "status"]] }
  ]
};

const db = await setupDb(config);

```

Unlike with `idb` or `Dexie`, you don't have to update schemas manually. 


Just define your desired `config` what stores and indexes are needed.  
`setupDb()` compares the config with the current database schema and handles schema updates and version upgrades automatically.


### Insert
```JS
const id = await DB.users.insert({}); 
```

### Put
Insert, replace if already exists
```JS
const id = await DB.users.put({});
```

### Get
Get one item by id
```JS
const id = await DB.users.get(id);
```


### Delete and clear
```JS
await DB.exampleStore.delete(key)
await DB.exampleStore.clear()
```

## Queries

```JS
const item = await DB.example.findOne(QueryObject, cb); 
const items = await DB.example.findMany(QueryObject, cb);
```

### Query Object
```js
{ category: "books", status: "active" }
```
For strict equality checks.  
Automatically selects and uses available indexes.

### Query Callbacks
Optional callback for additional filtering.
Callback is called for each item which passed the queryObject check.
If callback returns true, item is included. Example: 

```js
await DB.users.findMany(
	{country: "finland"}, 
	user => user.age > 24 && user.height < 166);
```
<br>

#### How it executes the queries behind the scenes
1. Checks for matching composite indexes whose fields are all present in queryObject. If multiple match, use the one with the most fields
2. If no composite index matches, try find first single-field index.
3. If no index matches, perform a full scan
4. Any remaining conditions are filtered in JavaScript.

**findOne** returns first record or null if not found  
**findMany** return array



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

### Indexes
- A string creates a single-field index.
- An array creates a compound index.
- Atm pptions fixed to the default of indexedDb {unique: false, multiEntry false}


## Schema sync behavior
On startup, `setupDb()` compares the requested schema with the existing database and upgrades it when needed.

- Creates missing stores
- Deletes stores that were removed from config
- Creates missing indexes
- Deletes indexes that were removed from config

## Hint
Enable DB globally. So you can access it anywhere without importing.
```js
globalThis.DB = setupDb(config);
````




### Todo
- Option to pass options for indexes
- Add more examples
<div align="center">
	<img src="assets/maxwebdb-logo.png" alt="Logo" width="200" height="200">
</div>

# maxwebdb
A simpler API for IndexedDB.

- **Promises:** async/await for all CRUD operations.
- **Easy Queries:** Auto-selects the best index for performance.
- **Auto schema sync:** Automatically handles schema changes and database upgrades.
- **Zero dependencies:** Single file, native performance, gzipped about 1.6kb.

```JS
await DB.users.insert();
await DB.products.findMany({query});
await DB.example.delete();
...
```

<details>
  <summary>Full example</summary>

  ```js
  import { setupDb } from "maxwebdb";

  const DB = await setupDb({
    name: "db1",
    stores: [
      { name: "users", indexes: ["email", "role"] }
    ]
  });

  const id = await DB.users.insert({
    name: "peter",
    email: "peter@example.com",
    role: "admin"
  });

  const user = await DB.users.get(id);
  console.log(user);
  ```
</details>



## Comparison
| Feature | maxwebdb | idb | localForage | Dexie |
|---|---|---|---|---|
| Primary Use Case | Simple local DB | Raw Wrapper | Key-value storage | Advanced local DB |
| Size (min+gzip) |  ~1.5kb | ~1.1kb |  ~9kb | ~26kb |
| Auto schema sync | ✅ | ❌ | ➖  | ❌ |
| Zero manual migrations | ✅ | ❌ | ✅ | ❌ |
| Object queries and filtering | ✅ | ❌ | ❌ | ✅ |
| Auto index selection | ✅ | ❌ | ❌ | ❌ |
| Observable / Live queries | ❌ | ❌ | ❌ | ✅ |


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

const DB = await setupDb(config);

```

Unlike with `idb` or `Dexie`, you don't have to update schemas manually. 


Just define your desired `config` what stores and indexes are needed.  
`setupDb()` compares the config with the current database schema and handles schema updates and version upgrades automatically.


### Insert
If the object has no `id`, auto generates.
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
const ids = await DB.users.getAll();
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
**findMany** returns an array


### Store definition
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
- Options fixed to the default of IndexedDb {unique: false, multiEntry false}








## Schema sync behavior
On startup, `setupDb()` compares the requested schema with the existing database and upgrades it when needed.

- Creates missing stores
- Deletes stores that were removed from config
- Creates missing indexes
- Deletes indexes that were removed from config

## Hint
Enable DB globally. So you can access it anywhere without importing.
```js
globalThis.DB = await setupDb(config);
```



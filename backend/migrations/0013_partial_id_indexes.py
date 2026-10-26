"""Make the unique `id` indexes safe for documents that store their id in `_id`.

Beanie stores a document's `id` as `_id`, so no `id` field exists. A plain unique index on
`id` sees null for every document and rejects the second insert. Rebuild each such index
under the same name as a partial index that only covers documents with a string `id`.
Safe to rerun.
"""

from pymongo import ASCENDING

PARTIAL = {"id": {"$type": "string"}}


async def up(db):
    for collection_name in await db.list_collection_names():
        collection = db[collection_name]
        for index_name, spec in (await collection.index_information()).items():
            if index_name == "_id_" or not spec.get("unique"):
                continue
            if list(spec.get("key", [])) != [("id", 1)] or "partialFilterExpression" in spec:
                continue
            await collection.drop_index(index_name)
            await collection.create_index(
                [("id", ASCENDING)],
                unique=True,
                name=index_name,
                partialFilterExpression=PARTIAL,
            )


async def down(db):
    """Partial indexes are the correct shape, so there is nothing to undo."""

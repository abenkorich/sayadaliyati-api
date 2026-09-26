# Healthcare directories

The signed-in patient portal offers Hospitals, Pharmacies and Doctors under
Care directory (desktop navigation) and More. Users can search by name or
specialty, filter by city, page through results, and open available phone,
email and map links. Empty and unavailable directories have recovery states.

Records come from the existing administration directories. Administrators must
set an entry to ACTIVE before it appears. No seed listings are fabricated.
Directory entries are contact records, not verified professional accounts.

GET /api/v1/directory/{kind} requires authentication; kind is hospitals,
pharmacies or doctors. Optional q and city are literal case-insensitive substring
filters (up to 100 characters). page defaults to 1 and limit to 20 (maximum 50).
The response includes data and pagination meta. Only public contact fields are
selected; draft/archived entries and internal license numbers are excluded.
The web BFF forwards only GET requests for these three directories.

Deploy the API and web changes together. The existing administration migration
provides the directory table; this feature needs no additional migration.

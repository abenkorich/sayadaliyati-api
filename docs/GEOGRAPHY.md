# Countries, wilayas and communes

Admin → Countries & locations supports creation, name editing and CSV import.
Import countries first, then wilayas for the selected country, then communes
for that country. To browse or manually add communes, select their wilaya.
Country codes use two uppercase letters. Wilaya/commune source IDs are stored
as codes; internal UUIDs and parent relationships are reusable for future
profile addresses. Codes/parents cannot be changed through the editor.

Download the CSV template from the selected tab. UTF-8, BOM, quoted commas,
multiline fields and Arabic/French names are supported. Maximum: 5,000 data
rows and 2 MB. Preview shows validation errors and the first 20 records;
Import applies all valid rows in a transaction. Re-importing a code under the
same parent updates names and delivery metadata without duplicates. Missing
wilayas, invalid fields, duplicate codes and malformed CSV block the entire
import. Imports do not delete records and are audited. Empty optional fields
clear the corresponding stored names/delivery metadata on re-import.

Headers follow the supplied geo_zones.json example:
- Countries: Country Code, English Name, Arabic Name, French Name.
- Wilayas: wilayaId, name English (or name / English Name), Arabic Name
  (or name Arabic), French Name (or name French), zone, isDeliverable.
- Communes: communeId, name, wilayaId; optional name Arabic, name French and
  wilayaName English/Arabic/French. Parent-name columns are accepted but parent
  linkage is resolved by wilayaId within the selected country. Names are not
  automatically translated or corrected. isDeliverable accepts true/false.

The attachment contains ellipses and trailing commas; it is an illustrative
schema, not a complete dataset. No geographic data is seeded from it.

Doctor/pharmacy/hospital editors assign Country → Wilaya → Commune. Care
Directory uses these UUID links for exact filters and retains legacy city
text search. Existing entries need their geographic links assigned before
appearing under these filters. User profile address fields are deferred.

API: authenticated GET /api/v1/geography/{countries|wilayas|communes}, optional
parentId (required to return child lists). Admin-only POST /admin/geography/{kind},
PATCH /admin/geography/{kind}/{id}, POST /admin/geography/{kind}/{preview|apply}
accepts {content,countryId?}. Directory GET accepts countryId, wilayaId, communeId.

Deployment: generate/build the Prisma client, apply migration
20260926000200_geography using the migration role, and grant the API runtime
SELECT/INSERT/UPDATE on geo_zones (included in local-runtime-grants.sql).
Deploy API and web together. No live database or user profiles were changed.

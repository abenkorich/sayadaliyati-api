# AI Specification

## 1. AI role

Saydaliyati AI is an assistant and orchestrator.

It is not the source of truth and is not an autonomous clinician.

## 2. Main AI capabilities

### Medicine explanation

User:

> What is this medicine?

AI retrieves the structured medicine record and explains:

-   name
-   active ingredient
-   strength
-   form
-   general purpose
-   available structured information

### Inventory questions

Examples:

-   What expires soon?
-   Do I have enough for my treatment?
-   What medicines contain paracetamol?
-   Which medicines are low in stock?

### Prescription explanation

AI explains the structured, user-confirmed prescription in plain
language.

### Treatment assistance

Examples:

-   What is my next dose?
-   How many doses remain?
-   How many days are left?
-   Did I miss a dose?

## 3. Tool architecture

AI should call typed application tools such as:

``` text
searchMedicines(query)
getMedicine(medicineId)
getInventory()
getExpiringInventory(days)
getActiveTreatments()
getTreatment(treatmentId)
getPrescription(prescriptionId)
calculateTreatmentStock(treatmentId)
getMedicationEvents(treatmentId, range)
```

The tools enforce the user's identity and authorization.

## 4. Never give AI direct SQL

Forbidden:

``` text
AI → PostgreSQL
```

Required:

``` text
AI → typed tool → authorization → service → database
```

## 5. Vision/OCR pipeline

``` text
Image
  ↓
quality checks
  ↓
barcode detection
  ↓
OCR / vision extraction
  ↓
candidate medicine matching
  ↓
confidence scoring
  ↓
USER CONFIRMATION
  ↓
structured record
```

For handwritten prescriptions, confidence thresholds must be stricter.

## 6. AI response rules

AI should clearly distinguish:

-   confirmed data
-   calculated values
-   interpretation
-   uncertainty

Example:

> Your prescription lists amoxicillin 500 mg three times daily. Please
> confirm that this matches the original prescription before starting
> the treatment.

## 7. Safety boundaries

The assistant must not:

-   diagnose a disease
-   prescribe a new medicine
-   change a doctor's dosage
-   invent interactions
-   fabricate contraindications
-   fabricate official medicine information
-   pretend that OCR is certain
-   expose another person's data

## 8. Tool authorization

Every AI tool receives the authenticated user context from the server.

Never let the model choose an arbitrary `patientId` to access data.

## 9. Prompting

Keep system instructions versioned in source control.

Prompt changes require regression tests.

## 10. Evaluation

Create a test set covering:

-   medicine identification
-   ambiguous names
-   multilingual medicine names
-   Arabic OCR
-   French OCR
-   dosage extraction
-   frequency extraction
-   date extraction
-   inventory calculations
-   authorization boundaries
-   prompt injection attempts
-   unsafe medical questions

## 11. AI UX

Use the brand name:

**Ask Saydaliyati**

Do not make the UI look like a generic chatbot.

Embed AI contextually into:

-   medicine detail
-   prescription
-   treatment
-   inventory

The global assistant remains available from Home.

# omr dev backend

A bare-minimum real backend for bubble-sheet (OMR) papers: FastAPI + SQLite on port 8610. Neither the answer-sheet checker nor the paper setter can read a bubble sheet, so this does it. It stores a paper's answer key, reads sheets from JSON (the bubbled options) or from an image of its own printable template, scores them per question with the paper setter's outcome rules (`correct`, `incorrect`, `blank`, `multiple`, `out_of_range`, `no_key`), and keeps every scored sheet. Every request needs `x-school-id`.

```sh
pip install -r requirements.txt
python -m uvicorn app:create_app --factory --port 8610
python -m pytest -q
```

Run the frontend against it with `DEV_BYPASS=1 DEV_LIVE_SERVICES=omr` (add it to whatever list is already set). `OMR_API_URL` defaults to `http://localhost:8610/api`.

| | |
|---|---|
| `GET /api/health` | liveness |
| `PUT /api/papers/{paper_id}/key` | `{questions: [{n, marks, options, answer}]}`; re-scores every stored sheet |
| `GET /api/papers/{paper_id}/key` | the stored key |
| `GET /api/papers/{paper_id}/template.png` | a printable sheet for that key |
| `POST /api/papers/{paper_id}/sheets` | `{roll_number, name, responses: [{n, chosen: [option index]}]}` |
| `POST /api/papers/{paper_id}/sheets/image` | multipart `image`, `roll_number`, `name` |
| `GET /api/papers/{paper_id}/sheets` | every scored sheet |
| `DELETE /api/papers/{paper_id}/sheets` | start the paper over |

A sheet is stored once per roll number per paper: sending it again replaces it. An image is read by finding the four corner squares of the template, mapping the bubble grid onto them, and counting ink inside each bubble, so it copes with a margin or a rescale but not with a rotated or folded sheet. Errors are `{code, message}`. Delete `omr.db` (or set `OMR_DB`) to start over.

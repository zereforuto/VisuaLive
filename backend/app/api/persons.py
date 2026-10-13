import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database.session import get_db
from app.models.orm import Person, DatasetMedia, FaceEmbedding
from app.schemas.schemas import PersonCreate, PersonUpdate, PersonResponse
from app.processing.dataset_processor import reload_known_embeddings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/persons", tags=["persons"])


def _to_response(db: Session, p: Person) -> PersonResponse:
    sample_count = db.query(func.count(DatasetMedia.MediaID)).filter(DatasetMedia.PersonID == p.PersonID).scalar()
    embedding_count = db.query(func.count(FaceEmbedding.EmbeddingID)).filter(FaceEmbedding.PersonID == p.PersonID).scalar()
    return PersonResponse(
        person_id=p.PersonID,
        name=p.Name,
        identifier=p.Identifier,
        description=p.Description,
        created_at=p.CreatedAt,
        updated_at=p.UpdatedAt,
        is_active=p.IsActive,
        sample_count=sample_count or 0,
        embedding_count=embedding_count or 0,
    )


@router.post("", response_model=PersonResponse)
def create_person(payload: PersonCreate, db: Session = Depends(get_db)):
    existing = db.query(Person).filter(Person.Identifier == payload.identifier).first()
    if existing:
        raise HTTPException(status_code=409, detail="A person with this identifier already exists.")
    person = Person(
        Name=payload.name, Identifier=payload.identifier, Description=payload.description
    )
    db.add(person)
    db.commit()
    db.refresh(person)
    return _to_response(db, person)


@router.get("", response_model=list[PersonResponse])
def list_persons(include_inactive: bool = False, db: Session = Depends(get_db)):
    query = db.query(Person)
    if not include_inactive:
        query = query.filter(Person.IsActive == True)  # noqa: E712
    return [_to_response(db, p) for p in query.order_by(Person.Name).all()]


@router.get("/{person_id}", response_model=PersonResponse)
def get_person(person_id: int, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.PersonID == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found.")
    return _to_response(db, person)


@router.put("/{person_id}", response_model=PersonResponse)
def update_person(person_id: int, payload: PersonUpdate, db: Session = Depends(get_db)):
    person = db.query(Person).filter(Person.PersonID == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found.")
    if payload.name is not None:
        person.Name = payload.name
    if payload.description is not None:
        person.Description = payload.description
    if payload.is_active is not None:
        person.IsActive = payload.is_active
    db.commit()
    db.refresh(person)
    reload_known_embeddings(db)
    return _to_response(db, person)


@router.delete("/{person_id}")
def delete_person(person_id: int, hard_delete: bool = False, db: Session = Depends(get_db)):
    """
    By default this deactivates the person (soft delete, keeps history).
    Pass hard_delete=true to fully remove the person and cascade-delete
    their media/embeddings — used for the privacy 'delete a person's
    dataset' requirement.
    """
    person = db.query(Person).filter(Person.PersonID == person_id).first()
    if not person:
        raise HTTPException(status_code=404, detail="Person not found.")
    if hard_delete:
        db.delete(person)
    else:
        person.IsActive = False
    db.commit()
    reload_known_embeddings(db)
    return {"status": "ok", "hard_delete": hard_delete}

# Database configuration and session management
import os
from sqlalchemy import create_engine, MetaData
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
import logging

logger = logging.getLogger(__name__)

# Database URL configuration
DATABASE_URL = os.getenv(
    'DATABASE_URL', 
    'sqlite:///./insomnia_transcripts.db'  # Default to SQLite for development
)

# Handle different database types
if DATABASE_URL.startswith('sqlite'):
    # SQLite configuration
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        echo=False  # Set to True for SQL debugging
    )
else:
    # PostgreSQL or other database configuration
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        echo=False  # Set to True for SQL debugging
    )

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create declarative base
Base = declarative_base()

# Metadata for migrations
metadata = MetaData()

def get_db() -> Session:
    """
    Dependency to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_database():
    """
    Initialize database tables
    """
    try:
        # Import models to register them
        from models import VideoTranscript, TranscriptSegment, SceneSubtitle
        
        # Create all tables
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")
        raise

def get_database_info():
    """
    Get database connection information for health checks
    """
    return {
        "database_url": DATABASE_URL.split('@')[-1] if '@' in DATABASE_URL else DATABASE_URL,
        "engine": str(engine.url),
        "tables": list(Base.metadata.tables.keys())
    }

# Authentication service for Google OAuth and JWT token management
import os
import jwt
import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from google.auth.transport import requests
from google.oauth2 import id_token
from sqlalchemy.orm import Session
from models import User
from database import get_db

logger = logging.getLogger(__name__)

# JWT Configuration
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# Google OAuth Configuration
GOOGLE_CLIENT_ID = os.getenv('GOOGLE_CLIENT_ID', '')

class AuthService:
    """
    Service for handling authentication operations
    """
    
    @staticmethod
    def verify_google_token(credential: str) -> Optional[Dict[str, Any]]:
        """
        Verify Google OAuth credential and extract user information
        """
        try:
            # Verify the token with Google
            idinfo = id_token.verify_oauth2_token(
                credential, 
                requests.Request(), 
                GOOGLE_CLIENT_ID
            )
            
            # Verify the issuer
            if idinfo['iss'] not in ['accounts.google.com', 'https://accounts.google.com']:
                raise ValueError('Wrong issuer.')
            
            return {
                'google_id': idinfo['sub'],
                'email': idinfo['email'],
                'name': idinfo['name'],
                'picture': idinfo.get('picture', ''),
                'email_verified': idinfo.get('email_verified', False)
            }
            
        except ValueError as e:
            logger.error(f"Google token verification failed: {e}")
            return None
        except Exception as e:
            logger.error(f"Unexpected error during token verification: {e}")
            return None
    
    @staticmethod
    def get_or_create_user(db: Session, google_user_info: Dict[str, Any]) -> Optional[User]:
        """
        Get existing user or create new user from Google OAuth info
        """
        try:
            # Check if user already exists
            user = db.query(User).filter(User.google_id == google_user_info['google_id']).first()
            
            if user:
                # Update user information and last login
                user.name = google_user_info['name']
                user.picture = google_user_info['picture']
                user.last_login = datetime.utcnow()
                db.commit()
                db.refresh(user)
                logger.info(f"User {user.email} logged in")
                return user
            else:
                # Create new user
                new_user = User(
                    google_id=google_user_info['google_id'],
                    email=google_user_info['email'],
                    name=google_user_info['name'],
                    picture=google_user_info['picture'],
                    last_login=datetime.utcnow()
                )
                
                db.add(new_user)
                db.commit()
                db.refresh(new_user)
                logger.info(f"New user created: {new_user.email}")
                return new_user
                
        except Exception as e:
            logger.error(f"Error creating/updating user: {e}")
            db.rollback()
            return None
    
    @staticmethod
    def create_jwt_token(user: User) -> str:
        """
        Create JWT token for authenticated user
        """
        payload = {
            'user_id': user.id,
            'email': user.email,
            'name': user.name,
            'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
            'iat': datetime.utcnow()
        }
        
        return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    
    @staticmethod
    def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
        """
        Verify JWT token and extract user information
        """
        try:
            payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {e}")
            return None
    
    @staticmethod
    def get_user_by_id(db: Session, user_id: str) -> Optional[User]:
        """
        Get user by ID
        """
        try:
            return db.query(User).filter(User.id == user_id, User.is_active == True).first()
        except Exception as e:
            logger.error(f"Error fetching user by ID: {e}")
            return None
    
    @staticmethod
    def authenticate_request(db: Session, authorization_header: Optional[str]) -> Optional[User]:
        """
        Authenticate request using Authorization header
        """
        if not authorization_header:
            return None
        
        try:
            # Extract token from "Bearer <token>" format
            if not authorization_header.startswith('Bearer '):
                return None
            
            token = authorization_header[7:]  # Remove "Bearer " prefix
            
            # Verify token
            payload = AuthService.verify_jwt_token(token)
            if not payload:
                return None
            
            # Get user from database
            user = AuthService.get_user_by_id(db, payload['user_id'])
            return user
            
        except Exception as e:
            logger.error(f"Error authenticating request: {e}")
            return None

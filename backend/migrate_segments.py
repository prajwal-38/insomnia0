#!/usr/bin/env python3
"""
Migration script to organize existing video segments into proxy/mezzanine directories.
This script moves existing segments from the flat structure to the new organized structure.
"""

import os
import shutil
import glob
from pathlib import Path

def migrate_segments_for_analysis(analysis_id: str, analyzed_videos_dir: str):
    """
    Migrate segments for a specific analysis from flat structure to organized structure.
    
    Args:
        analysis_id: The analysis ID to migrate
        analyzed_videos_dir: Base directory containing analyzed videos
    """
    segments_dir = os.path.join(analyzed_videos_dir, analysis_id, "segments")
    
    if not os.path.exists(segments_dir):
        print(f"❌ Segments directory not found for analysis {analysis_id}")
        return
    
    # Create new directory structure
    proxy_dir = os.path.join(segments_dir, "proxy")
    mezzanine_dir = os.path.join(segments_dir, "mezzanine")
    
    os.makedirs(proxy_dir, exist_ok=True)
    os.makedirs(mezzanine_dir, exist_ok=True)
    
    # Find all segment files in the root segments directory
    proxy_files = glob.glob(os.path.join(segments_dir, "*_proxy.mp4"))
    mezzanine_files = glob.glob(os.path.join(segments_dir, "*_mezzanine.mp4"))
    
    print(f"📁 Migrating segments for analysis {analysis_id}")
    print(f"   Found {len(proxy_files)} proxy files and {len(mezzanine_files)} mezzanine files")
    
    # Move proxy files
    for proxy_file in proxy_files:
        filename = os.path.basename(proxy_file)
        destination = os.path.join(proxy_dir, filename)
        
        if not os.path.exists(destination):
            shutil.move(proxy_file, destination)
            print(f"   ✅ Moved proxy: {filename}")
        else:
            print(f"   ⚠️  Proxy already exists: {filename}")
    
    # Move mezzanine files
    for mezzanine_file in mezzanine_files:
        filename = os.path.basename(mezzanine_file)
        destination = os.path.join(mezzanine_dir, filename)
        
        if not os.path.exists(destination):
            shutil.move(mezzanine_file, destination)
            print(f"   ✅ Moved mezzanine: {filename}")
        else:
            print(f"   ⚠️  Mezzanine already exists: {filename}")

def migrate_all_segments(analyzed_videos_dir: str = "analyzed_videos_store"):
    """
    Migrate all existing segments to the new directory structure.
    
    Args:
        analyzed_videos_dir: Base directory containing analyzed videos
    """
    if not os.path.exists(analyzed_videos_dir):
        print(f"❌ Analyzed videos directory not found: {analyzed_videos_dir}")
        return
    
    print("🚀 Starting segment migration to new directory structure...")
    print("   New structure: segments/proxy/ and segments/mezzanine/")
    print()
    
    # Find all analysis directories
    analysis_dirs = [d for d in os.listdir(analyzed_videos_dir) 
                    if os.path.isdir(os.path.join(analyzed_videos_dir, d))]
    
    if not analysis_dirs:
        print("❌ No analysis directories found")
        return
    
    print(f"📊 Found {len(analysis_dirs)} analysis directories to migrate")
    print()
    
    migrated_count = 0
    for analysis_id in analysis_dirs:
        try:
            migrate_segments_for_analysis(analysis_id, analyzed_videos_dir)
            migrated_count += 1
        except Exception as e:
            print(f"❌ Error migrating {analysis_id}: {str(e)}")
    
    print()
    print(f"✅ Migration complete! Migrated {migrated_count}/{len(analysis_dirs)} analyses")
    print()
    print("🔍 Verifying new structure...")
    
    # Verify the migration
    for analysis_id in analysis_dirs[:3]:  # Check first 3 as examples
        segments_dir = os.path.join(analyzed_videos_dir, analysis_id, "segments")
        proxy_dir = os.path.join(segments_dir, "proxy")
        mezzanine_dir = os.path.join(segments_dir, "mezzanine")
        
        if os.path.exists(proxy_dir) and os.path.exists(mezzanine_dir):
            proxy_count = len(glob.glob(os.path.join(proxy_dir, "*.mp4")))
            mezzanine_count = len(glob.glob(os.path.join(mezzanine_dir, "*.mp4")))
            print(f"   📁 {analysis_id}: {proxy_count} proxy, {mezzanine_count} mezzanine")

if __name__ == "__main__":
    # Run the migration
    migrate_all_segments()

"""
Performance Monitoring Module for Insomnia Video Editor Backend

This module provides comprehensive performance monitoring and metrics collection
to help identify bottlenecks and track improvements in video processing operations.
"""

import time
import logging
import json
import os
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from contextlib import contextmanager

logger = logging.getLogger(__name__)

@dataclass
class PerformanceMetric:
    """Data class for storing performance metrics."""
    operation: str
    start_time: float
    end_time: float
    duration: float
    success: bool
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return asdict(self)

class PerformanceMonitor:
    """Performance monitoring and metrics collection."""
    
    def __init__(self, log_file: str = "performance_metrics.json"):
        self.log_file = log_file
        self.metrics: List[PerformanceMetric] = []
        self.active_operations: Dict[str, float] = {}
        
    @contextmanager
    def measure_operation(self, operation_name: str, metadata: Optional[Dict[str, Any]] = None):
        """Context manager for measuring operation performance."""
        start_time = time.time()
        operation_id = f"{operation_name}_{start_time}"
        self.active_operations[operation_id] = start_time
        
        try:
            logger.info(f"Starting operation: {operation_name}")
            yield operation_id
            
            # Operation completed successfully
            end_time = time.time()
            duration = end_time - start_time
            
            metric = PerformanceMetric(
                operation=operation_name,
                start_time=start_time,
                end_time=end_time,
                duration=duration,
                success=True,
                metadata=metadata
            )
            
            self.metrics.append(metric)
            logger.info(f"Completed operation: {operation_name} in {duration:.2f}s")
            
        except Exception as e:
            # Operation failed
            end_time = time.time()
            duration = end_time - start_time
            
            metric = PerformanceMetric(
                operation=operation_name,
                start_time=start_time,
                end_time=end_time,
                duration=duration,
                success=False,
                error_message=str(e),
                metadata=metadata
            )
            
            self.metrics.append(metric)
            logger.error(f"Failed operation: {operation_name} after {duration:.2f}s - {str(e)}")
            raise
            
        finally:
            if operation_id in self.active_operations:
                del self.active_operations[operation_id]
    
    def log_metric(self, operation: str, duration: float, success: bool = True, 
                   error_message: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
        """Manually log a performance metric."""
        end_time = time.time()
        start_time = end_time - duration
        
        metric = PerformanceMetric(
            operation=operation,
            start_time=start_time,
            end_time=end_time,
            duration=duration,
            success=success,
            error_message=error_message,
            metadata=metadata
        )
        
        self.metrics.append(metric)
        
        if success:
            logger.info(f"Logged metric: {operation} completed in {duration:.2f}s")
        else:
            logger.error(f"Logged metric: {operation} failed after {duration:.2f}s - {error_message}")
    
    def get_metrics_summary(self, operation_filter: Optional[str] = None, 
                           time_window_hours: Optional[int] = None) -> Dict[str, Any]:
        """Get summary statistics for performance metrics."""
        filtered_metrics = self.metrics
        
        # Filter by operation type
        if operation_filter:
            filtered_metrics = [m for m in filtered_metrics if operation_filter in m.operation]
        
        # Filter by time window
        if time_window_hours:
            cutoff_time = time.time() - (time_window_hours * 3600)
            filtered_metrics = [m for m in filtered_metrics if m.start_time >= cutoff_time]
        
        if not filtered_metrics:
            return {"message": "No metrics found for the specified criteria"}
        
        # Calculate statistics
        durations = [m.duration for m in filtered_metrics]
        successful_operations = [m for m in filtered_metrics if m.success]
        failed_operations = [m for m in filtered_metrics if not m.success]
        
        summary = {
            "total_operations": len(filtered_metrics),
            "successful_operations": len(successful_operations),
            "failed_operations": len(failed_operations),
            "success_rate": len(successful_operations) / len(filtered_metrics) * 100,
            "duration_stats": {
                "min": min(durations),
                "max": max(durations),
                "avg": sum(durations) / len(durations),
                "total": sum(durations)
            },
            "operations_by_type": {}
        }
        
        # Group by operation type
        operation_types = {}
        for metric in filtered_metrics:
            op_type = metric.operation
            if op_type not in operation_types:
                operation_types[op_type] = []
            operation_types[op_type].append(metric.duration)
        
        for op_type, durations in operation_types.items():
            summary["operations_by_type"][op_type] = {
                "count": len(durations),
                "avg_duration": sum(durations) / len(durations),
                "min_duration": min(durations),
                "max_duration": max(durations)
            }
        
        return summary
    
    def save_metrics_to_file(self):
        """Save all metrics to a JSON file."""
        try:
            metrics_data = {
                "timestamp": datetime.now().isoformat(),
                "metrics": [metric.to_dict() for metric in self.metrics]
            }
            
            with open(self.log_file, 'w') as f:
                json.dump(metrics_data, f, indent=2)
                
            logger.info(f"Saved {len(self.metrics)} metrics to {self.log_file}")
            
        except Exception as e:
            logger.error(f"Failed to save metrics to file: {str(e)}")
    
    def load_metrics_from_file(self):
        """Load metrics from a JSON file."""
        try:
            if not os.path.exists(self.log_file):
                logger.info(f"Metrics file {self.log_file} does not exist")
                return
            
            with open(self.log_file, 'r') as f:
                data = json.load(f)
            
            self.metrics = []
            for metric_data in data.get("metrics", []):
                metric = PerformanceMetric(**metric_data)
                self.metrics.append(metric)
            
            logger.info(f"Loaded {len(self.metrics)} metrics from {self.log_file}")
            
        except Exception as e:
            logger.error(f"Failed to load metrics from file: {str(e)}")
    
    def clear_old_metrics(self, days_to_keep: int = 7):
        """Remove metrics older than specified days."""
        cutoff_time = time.time() - (days_to_keep * 24 * 3600)
        original_count = len(self.metrics)
        
        self.metrics = [m for m in self.metrics if m.start_time >= cutoff_time]
        
        removed_count = original_count - len(self.metrics)
        if removed_count > 0:
            logger.info(f"Removed {removed_count} old metrics (older than {days_to_keep} days)")

# Global performance monitor instance
performance_monitor = PerformanceMonitor()

# Convenience functions for common operations
def measure_video_analysis(metadata: Optional[Dict[str, Any]] = None):
    """Context manager for measuring video analysis operations."""
    return performance_monitor.measure_operation("video_analysis", metadata)

def measure_segment_generation(metadata: Optional[Dict[str, Any]] = None):
    """Context manager for measuring video segment generation."""
    return performance_monitor.measure_operation("segment_generation", metadata)

def measure_transcription(metadata: Optional[Dict[str, Any]] = None):
    """Context manager for measuring transcription operations."""
    return performance_monitor.measure_operation("transcription", metadata)

def measure_api_request(endpoint: str, metadata: Optional[Dict[str, Any]] = None):
    """Context manager for measuring API request processing."""
    operation_name = f"api_request_{endpoint.replace('/', '_')}"
    return performance_monitor.measure_operation(operation_name, metadata)

def get_performance_summary(hours: int = 24) -> Dict[str, Any]:
    """Get performance summary for the last N hours."""
    return performance_monitor.get_metrics_summary(time_window_hours=hours)

def log_performance_metric(operation: str, duration: float, success: bool = True, 
                          error: Optional[str] = None, **metadata):
    """Log a performance metric with optional metadata."""
    performance_monitor.log_metric(operation, duration, success, error, metadata)

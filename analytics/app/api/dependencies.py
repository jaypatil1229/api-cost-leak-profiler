from fastapi import Request
def get_analysis_service(request: Request): return request.app.state.analysis_service

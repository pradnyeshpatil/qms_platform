from django.contrib import admin

from .models import EightDReport, EightDSection, ReportApproval, ReportRevision

admin.site.register(EightDReport)
admin.site.register(EightDSection)
admin.site.register(ReportApproval)
admin.site.register(ReportRevision)

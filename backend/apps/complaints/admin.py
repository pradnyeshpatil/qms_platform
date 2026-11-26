from django.contrib import admin

from .models import Complaint, ComplaintAssignee, ComplaintStatus, DefectCategory

admin.site.register(Complaint)
admin.site.register(ComplaintStatus)
admin.site.register(ComplaintAssignee)
admin.site.register(DefectCategory)

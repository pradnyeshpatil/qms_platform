from django.contrib import admin

from .models import Company, Department, Invitation, Membership, Plant

admin.site.register(Company)
admin.site.register(Plant)
admin.site.register(Department)
admin.site.register(Membership)
admin.site.register(Invitation)

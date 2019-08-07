import { ABP } from '@abp/ng.core';
import { ConfirmationService, Toaster } from '@abp/ng.theme.shared';
import { Component, TemplateRef, TrackByFunction, ViewChild } from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Select, Store } from '@ngxs/store';
import { combineLatest, Observable } from 'rxjs';
import { filter, finalize, map, pluck, take } from 'rxjs/operators';
import snq from 'snq';
import {
  IdentityAddUser,
  IdentityDeleteUser,
  IdentityGetUserById,
  IdentityGetUserRoles,
  IdentityGetUsers,
  IdentityUpdateUser,
} from '../../actions/identity.actions';
import { Identity } from '../../models/identity';
import { IdentityState } from '../../states/identity.state';
@Component({
  selector: 'abp-users',
  templateUrl: './users.component.html',
})
export class UsersComponent {
  @Select(IdentityState.getUsers)
  data$: Observable<Identity.UserItem[]>;

  @Select(IdentityState.getUsersTotalCount)
  totalCount$: Observable<number>;

  @ViewChild('modalContent', { static: false })
  modalContent: TemplateRef<any>;

  form: FormGroup;

  selected: Identity.UserItem;

  selectedUserRoles: Identity.RoleItem[];

  roles: Identity.RoleItem[];

  visiblePermissions: boolean = false;

  providerKey: string;

  pageQuery: ABP.PageQueryParams = {
    sorting: 'userName',
  };

  isModalVisible: boolean;

  loading: boolean = false;

  trackByFn: TrackByFunction<AbstractControl> = (index, item) => Object.keys(item)[0] || index;

  get roleGroups(): FormGroup[] {
    return snq(() => (this.form.get('roleNames') as FormArray).controls as FormGroup[], []);
  }

  constructor(private confirmationService: ConfirmationService, private fb: FormBuilder, private store: Store) {}

  onSearch(value) {
    this.pageQuery.filter = value;
    this.get();
  }

  buildForm() {
    this.roles = this.store.selectSnapshot(IdentityState.getRoles);

    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.maxLength(32)]],
      userName: [this.selected.userName || '', [Validators.required, Validators.maxLength(256)]],
      email: [this.selected.email || '', [Validators.required, Validators.email, Validators.maxLength(256)]],
      name: [this.selected.name || '', [Validators.maxLength(64)]],
      surname: [this.selected.surname || '', [Validators.maxLength(64)]],
      phoneNumber: [this.selected.phoneNumber || '', [Validators.maxLength(16)]],
      lockoutEnabled: [this.selected.twoFactorEnabled || (this.selected.id ? false : true)],
      twoFactorEnabled: [this.selected.twoFactorEnabled || (this.selected.id ? false : true)],
      roleNames: this.fb.array(
        this.roles.map(role =>
          this.fb.group({
            [role.name]: [!!snq(() => this.selectedUserRoles.find(userRole => userRole.id === role.id))],
          }),
        ),
      ),
    });
  }

  openModal() {
    this.buildForm();
    this.isModalVisible = true;
  }

  onAdd() {
    this.selected = {} as Identity.UserItem;
    this.selectedUserRoles = [] as Identity.RoleItem[];
    this.openModal();
  }

  onEdit(id: string) {
    combineLatest([this.store.dispatch(new IdentityGetUserById(id)), this.store.dispatch(new IdentityGetUserRoles(id))])
      .pipe(
        filter(([res1, res2]) => res1 && res2),
        map(([state, _]) => state),
        pluck('IdentityState'),
        take(1),
      )
      .subscribe((state: Identity.State) => {
        this.selected = state.selectedUser;
        this.selectedUserRoles = state.selectedUserRoles;
        this.openModal();
      });
  }

  save() {
    if (!this.form.valid) return;

    const { roleNames } = this.form.value;
    const mappedRoleNames = snq(
      () => roleNames.filter(role => !!role[Object.keys(role)[0]]).map(role => Object.keys(role)[0]),
      [],
    );

    this.store
      .dispatch(
        this.selected.id
          ? new IdentityUpdateUser({
              ...this.form.value,
              id: this.selected.id,
              roleNames: mappedRoleNames,
            })
          : new IdentityAddUser({
              ...this.form.value,
              roleNames: mappedRoleNames,
            }),
      )
      .subscribe(() => {
        this.isModalVisible = false;
      });
  }

  delete(id: string, userName: string) {
    this.confirmationService
      .warn('AbpIdentity::UserDeletionConfirmationMessage', 'AbpIdentity::AreYouSure', {
        messageLocalizationParams: [userName],
      })
      .subscribe((status: Toaster.Status) => {
        if (status === Toaster.Status.confirm) {
          this.store.dispatch(new IdentityDeleteUser(id));
        }
      });
  }

  onPageChange(data) {
    this.pageQuery.skipCount = data.first;
    this.pageQuery.maxResultCount = data.rows;

    this.get();
  }

  get() {
    this.loading = true;
    this.store
      .dispatch(new IdentityGetUsers(this.pageQuery))
      .pipe(finalize(() => (this.loading = false)))
      .subscribe();
  }
}

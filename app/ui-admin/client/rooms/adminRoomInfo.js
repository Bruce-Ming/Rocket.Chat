import { Meteor } from 'meteor/meteor';
import { ReactiveVar } from 'meteor/reactive-var';
import { Session } from 'meteor/session';
import { Template } from 'meteor/templating';
import { TAPi18n } from 'meteor/rocketchat:tap-i18n';
import toastr from 'toastr';
import s from 'underscore.string';
import { AdminChatRoom } from './adminRooms';
import { t, handleError, roomTypes } from '../../../utils';
import { call, modal } from '../../../ui-utils';
import { hasAllPermission, hasAtLeastOnePermission } from '../../../authorization';
import { ChannelSettings } from '../../../channel-settings';
import { settings } from '../../../settings';
import { callbacks } from '../../../callbacks';

Template.adminRoomInfo.helpers({
	selectedRoom() {
		return Session.get('adminRoomsSelected');
	},
	canEdit() {
		return hasAllPermission('edit-room', this.rid);
	},
	editing(field) {
		return Template.instance().editing.get() === field;
	},
	notDirect() {
		const room = Template.instance().room.get();
		return room && room.t !== 'd';
	},
	notDiscussion() {
		const room = AdminChatRoom.findOne(this.rid, { fields: { prid: 1 } });
		return room && !room.prid;
	},
	roomType() {
		const room = Template.instance().room.get();
		return room && room.t;
	},
	roomAvatar() {
		const room = AdminChatRoom.findOne(this.rid, { fields: { t: 1 } });
		return roomTypes.getConfig(room.t).getAvatarPath(room);
	},
	newRoomAvatar() {
		return Template.instance().newRoomAvatar.get();
	},
	initials() {
		const room = AdminChatRoom.findOne(this.rid, { fields: { name: 1 } });
		return `@${ room.name }`;
	},
	selectAvatarUrl() {
		return Template.instance().newRoomAvatarUrl.get().trim() ? '' : 'disabled';
	},
	channelSettings() {
		return ChannelSettings.getOptions(undefined, 'admin-room');
	},
	roomTypeDescription() {
		const room = Template.instance().room.get();
		const roomType = room && room.t;
		if (roomType === 'c') {
			return t('Channel');
		} if (roomType === 'p') {
			return t('Private_Group');
		}
	},
	roomName() {
		const room = Template.instance().room.get();
		return room && room.name;
	},
	roomOwner() {
		const roomOwner = Template.instance().roomOwner.get();
		return roomOwner && (roomOwner.name || roomOwner.username);
	},
	roomTopic() {
		const room = Template.instance().room.get();
		return room && room.topic;
	},
	archivationState() {
		const room = Template.instance().room.get();
		return room && room.archived;
	},
	archivationStateDescription() {
		const room = Template.instance().room.get();
		const archivationState = room && room.archived;
		if (archivationState === true) {
			return t('Room_archivation_state_true');
		}
		return t('Room_archivation_state_false');
	},
	canDeleteRoom() {
		const room = Template.instance().room.get();
		const roomType = room && room.t;
		return (roomType != null) && hasAtLeastOnePermission(`delete-${ roomType }`);
	},
	readOnly() {
		const room = Template.instance().room.get();
		return room && room.ro;
	},
	readOnlyDescription() {
		const room = Template.instance().room.get();
		const readOnly = room && room.ro;

		if (readOnly === true) {
			return t('True');
		}
		return t('False');
	},
});

Template.adminRoomInfo.events({
	'click .delete'(event, instance) {
		modal.open({
			title: t('Are_you_sure'),
			text: t('Delete_Room_Warning'),
			type: 'warning',
			showCancelButton: true,
			confirmButtonColor: '#DD6B55',
			confirmButtonText: t('Yes_delete_it'),
			cancelButtonText: t('Cancel'),
			closeOnConfirm: false,
			html: false,
		}, () => {
			Meteor.call('eraseRoom', this.rid, function(error) {
				if (error) {
					handleError(error);
				} else {
					modal.open({
						title: t('Deleted'),
						text: t('Room_has_been_deleted'),
						type: 'success',
						timer: 2000,
						showConfirmButton: false,
					});
					instance.onSuccess();
					instance.data.tabBar.close();
				}
			});
		});
	},
	'keydown input[type=text]'(e, t) {
		if (e.keyCode === 13) {
			e.preventDefault();
			t.saveSetting(this.rid);
		}
	},
	'click .js-select-avatar-initials'(event, t) {
		const room = AdminChatRoom.findOne(this.rid, { fields: { name: 1 } });
		t.newRoomAvatar.set({
			service: 'initials',
			contentType: '',
			blob: `@${ room.name }`,
		});
	},
	'change .js-select-avatar-upload [type=file]'(event, t) {
		const e = event.originalEvent || event;
		let { files } = e.target;
		if (!files || files.length === 0) {
			files = (e.dataTransfer && e.dataTransfer.files) || [];
		}
		Object.keys(files).forEach((key) => {
			const blob = files[key];
			if (!/image\/.+/.test(blob.type)) {
				return;
			}
			const reader = new FileReader();
			reader.readAsDataURL(blob);
			reader.onloadend = () => {
				t.newRoomAvatar.set({
					service: 'upload',
					contentType: blob.type,
					blob: reader.result,
				});
			};
		});
	},
	'click .js-select-avatar-url'(e, t) {
		const url = t.newRoomAvatarUrl.get().trim();
		if (!url) {
			return;
		}

		t.newRoomAvatar.set({
			service: 'url',
			blob: url,
			contentType: '',
		});
	},
	'input .js-avatar-url-input'(e, t) {
		const text = e.target.value;
		t.newRoomAvatarUrl.set(text);
	},
	'click [data-edit]'(e, t) {
		e.preventDefault();
		t.editing.set($(e.currentTarget).data('edit'));
		return setTimeout(function() {
			t.$('input.editing').focus().select();
		}, 100);
	},
	'click .cancel'(e, t) {
		e.preventDefault();
		t.editing.set();
	},
	'click .save'(e, t) {
		e.preventDefault();
		t.saveSetting(this.rid);
	},
});

Template.adminRoomInfo.onCreated(function() {
	const instance = this;
	const currentData = Template.currentData();
	this.editing = new ReactiveVar();
	this.room = new ReactiveVar();
	this.roomOwner = new ReactiveVar();
	this.newRoomAvatar = new ReactiveVar();
	this.newRoomAvatarUrl = new ReactiveVar('');
	this.onSuccess = Template.currentData().onSuccess;

	this.autorun(() => {
		const { room } = Template.currentData();
		this.room.set(room);
	});

	this.validateRoomType = () => {
		const type = this.$('input[name=roomType]:checked').val();
		if (type !== 'c' && type !== 'p') {
			toastr.error(t('error-invalid-room-type', { type }));
		}
		return true;
	};
	this.validateRoomName = (rid) => {
		const { room } = currentData;
		let nameValidation;
		if (!hasAllPermission('edit-room', rid) || (room.t !== 'c' && room.t !== 'p')) {
			toastr.error(t('error-not-allowed'));
			return false;
		}
		name = $('input[name=roomName]').val();
		try {
			nameValidation = new RegExp(`^${ settings.get('UTF8_Names_Validation') }$`);
		} catch (_error) {
			nameValidation = new RegExp('^[0-9a-zA-Z-_.]+$');
		}
		if (!nameValidation.test(name)) {
			toastr.error(t('error-invalid-room-name', {
				room_name: s.escapeHTML(name),
			}));
			return false;
		}
		return true;
	};
	this.validateRoomTopic = () => true;
	this.saveSetting = (rid) => {
		switch (this.editing.get()) {
			case 'roomAvatar':
				const newRoomAvatar = this.newRoomAvatar.get();
				if (newRoomAvatar) {
					Meteor.call('saveRoomSettings', rid, 'roomAvatar', newRoomAvatar, function(err) {
						if (err) {
							return handleError(err);
						}

						const room = AdminChatRoom.findOne(rid);
						toastr.success(TAPi18n.__('Room_avatar_changed_successfully'));
						callbacks.run('roomAvatarChanged', room);

						const url = roomTypes.getConfig(room.t).getAvatarPath(room);
						setTimeout(() => { // wait for editing mode to finish
							$('#admin-room-avatar-preview .avatar-image').attr('src', url);
							$(`tr[data-id='${ rid }'] .avatar-image`).attr('src', url);
						});
					});
				}
				break;
			case 'roomName':
				if (this.validateRoomName(rid)) {
					callbacks.run('roomNameChanged', currentData.room);
					Meteor.call('saveRoomSettings', rid, 'roomName', this.$('input[name=roomName]').val(), function(err) {
						if (err) {
							return handleError(err);
						}
						toastr.success(TAPi18n.__('Room_name_changed_successfully'));
						instance.onSuccess();
						instance.data.tabBar.close();
					});
				}
				break;
			case 'roomTopic':
				if (this.validateRoomTopic(rid)) {
					Meteor.call('saveRoomSettings', rid, 'roomTopic', this.$('input[name=roomTopic]').val(), function(err) {
						if (err) {
							return handleError(err);
						}
						toastr.success(TAPi18n.__('Room_topic_changed_successfully'));
						callbacks.run('roomTopicChanged', currentData.room);
						instance.onSuccess();
						instance.data.tabBar.close();
					});
				}
				break;
			case 'roomAnnouncement':
				if (this.validateRoomTopic(rid)) {
					Meteor.call('saveRoomSettings', rid, 'roomAnnouncement', this.$('input[name=roomAnnouncement]').val(), function(err) {
						if (err) {
							return handleError(err);
						}
						toastr.success(TAPi18n.__('Room_announcement_changed_successfully'));
						callbacks.run('roomAnnouncementChanged', currentData.room);
						instance.onSuccess();
						instance.data.tabBar.close();
					});
				}
				break;
			case 'roomType':
				const val = this.$('input[name=roomType]:checked').val();
				if (this.validateRoomType(rid)) {
					callbacks.run('roomTypeChanged', currentData.room);
					const saveRoomSettings = function() {
						Meteor.call('saveRoomSettings', rid, 'roomType', val, function(err) {
							if (err) {
								return handleError(err);
							}
							toastr.success(TAPi18n.__('Room_type_changed_successfully'));
							instance.onSuccess();
							instance.data.tabBar.close();
						});
					};
					if (!currentData.room.default) {
						return saveRoomSettings();
					}
					modal.open({
						title: t('Room_default_change_to_private_will_be_default_no_more'),
						type: 'warning',
						showCancelButton: true,
						confirmButtonColor: '#DD6B55',
						confirmButtonText: t('Yes'),
						cancelButtonText: t('Cancel'),
						closeOnConfirm: true,
						html: false,
					}, function(confirmed) {
						return !confirmed || saveRoomSettings();
					});
				}
				break;
			case 'archivationState':
				const { room } = currentData;
				if (this.$('input[name=archivationState]:checked').val() === 'true') {
					if (room && room.archived !== true) {
						Meteor.call('archiveRoom', rid, function(err) {
							if (err) {
								return handleError(err);
							}
							toastr.success(TAPi18n.__('Room_archived'));
							callbacks.run('archiveRoom', currentData.room);
							instance.onSuccess();
							instance.data.tabBar.close();
						});
					}
				} else if ((room && room.archived) === true) {
					Meteor.call('unarchiveRoom', rid, function(err) {
						if (err) {
							return handleError(err);
						}
						toastr.success(TAPi18n.__('Room_unarchived'));
						callbacks.run('unarchiveRoom', currentData.room);
						instance.onSuccess();
						instance.data.tabBar.close();
					});
				}
				break;
			case 'readOnly':
				Meteor.call('saveRoomSettings', rid, 'readOnly', this.$('input[name=readOnly]:checked').val() === 'true', function(err) {
					if (err) {
						return handleError(err);
					}
					toastr.success(TAPi18n.__('Read_only_changed_successfully'));
					instance.onSuccess();
					instance.data.tabBar.close();
				});
		}
		this.editing.set();
	};

	this.autorun(async () => {
		this.roomOwner.set(null);
		for (const { roles, u } of await call('getRoomRoles', Session.get('adminRoomsSelected').rid)) {
			if (roles.includes('owner')) {
				this.roomOwner.set(u);
			}
		}
	});
});
